from apscheduler.schedulers.background import BackgroundScheduler
from database import get_db_connection
import datetime
import requests
import json
import re
import os
import time

# Configurable Retention Policies
LOG_RETENTION_DAYS = 2  # Delete files older than 2 days
DB_RETENTION_DAYS = 2   # Delete DB records older than 2 days

def _parse_template(template_str, sp_name, deviceid, overrides=None):
    try:
        # 1. Fetch live mapping data natively from Stored Procedure logic bounds
        from database import get_db_connection
        conn = get_db_connection()
        db_context = {}
        try:
            with conn.cursor() as cursor:
                cursor.execute(f"SELECT * FROM {sp_name}(%s)", (deviceid,))
                result = cursor.fetchone()
                if result: 
                    db_context = dict(result)
                    
                    # Natively recursively flatten any nested JSON dictionaries so sub-fields map dynamically automatically cleanly.
                    for k, v in list(db_context.items()):
                        if isinstance(v, str):
                            try:
                                if v.strip().startswith('{') and v.strip().endswith('}'):
                                    v = json.loads(v)
                            except Exception:
                                pass
                                
                        if isinstance(v, dict):
                            for sub_k, sub_v in v.items():
                                db_context[sub_k] = sub_v
        except Exception as e:
            print(f"STORED_PROCEDURE Execution Error ({sp_name}): {e}")
        finally:
            if conn: conn.close()

        data = json.loads(template_str)
        
        def traverse(obj):
            if isinstance(obj, dict):
                mapped_dict = {}
                for k, v in obj.items():
                    if overrides and k in overrides:
                        mapped_dict[k] = overrides[k]
                    else:
                        mapped_dict[k] = traverse(v)
                return mapped_dict
            elif isinstance(obj, list):
                return [traverse(elem) for elem in obj]
            elif isinstance(obj, str):
                if obj.startswith('#'):
                    return obj[1:]  # Return raw text without #
                elif obj.startswith('$'):
                    tag_name = obj[1:]
                    # Soft map to SP columns case selectively (e.g. client, location...)
                    val = db_context.get(tag_name)
                    if val is None: val = db_context.get(tag_name.lower())
                    if val is not None:
                        import decimal
                        if isinstance(val, decimal.Decimal):
                            return int(val) if val % 1 == 0 else float(val)
                        return val
                    
                    return f"NOT_FOUND_{tag_name}"
                return obj
            return obj
            
        parsed_data = traverse(data)
        return json.dumps(parsed_data, indent=2)
    except Exception as e:
        print(f"Template parsing failed: {e}")
        return template_str

def orchestrate_json_payloads():
    """
    JSON Orchestrator (1-Min interval): Evaluates `#Tags` and `$Tags` logic.
    """
    print("Running JSON Orchestrator...")
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            # 1. Look for un-processed IoT data
            cursor.execute("SELECT slno, deviceid, revText, receivedOn FROM tblDatareceiver WHERE isProcessed=0 LIMIT 5000")
            unprocessed = cursor.fetchall()
            
            if not unprocessed:
                return
                
            # Map devices already executed in this interval to prevent massive duplicate JSON spam
            orchestrated_devices = set()
            processed_slnos = []
            

            
            
            for row in unprocessed:
                slno = row['slno']
                dev_id = row['deviceid']
                processed_slnos.append(slno)
                
                # If we've already transmitted & built this payload in this cycle, silently mark block processed to exhaust the queue safely
                if dev_id in orchestrated_devices:
                    continue
                
                # Fetch formatter securely inheriting via Company definition && Check Output Folder Name
                cursor.execute("""
                    SELECT f.jsonTemplate, f.storedProcedureName, m.folder_name, dm.create_json_file, s.is_active, s.slno as schedule_id, f.type as payload_type
                    FROM tblDeviceMaster dm
                    JOIN tblDeviceJsonMapping m ON dm.customer_code = m.customer_code
                    JOIN tblJsonFormatter f ON m.scheduledJsonId = f.slno 
                    LEFT JOIN tblScheduler s ON dm.customer_code = s.customer_code AND s.isDeleted=0
                    WHERE dm.deviceid=%s AND f.isDeleted=0
                """, (dev_id,))
                formatter = cursor.fetchone()
                
                if formatter and (formatter.get('jsontemplate') or formatter.get('jsonTemplate')):
                    is_active = formatter.get('is_active')
                    
                    if is_active is False:
                        # Safely drop processing queue without triggering execution
                        continue

                    template = formatter.get('jsontemplate') or formatter.get('jsonTemplate')
                    sp_name = formatter.get('storedprocedurename') or formatter.get('storedProcedureName')
                    folder_name = formatter.get('folder_name') or ''
                    create_json_file = formatter.get('create_json_file')
                    
                    if sp_name:
                        # Simulated parsing #Tags (static text overrides) and $Tags (SP results)
                        result_payload = _parse_template(template, sp_name, dev_id)
                        
                        # Write JSON Locally as Requested
                        if create_json_file and folder_name and folder_name.strip():
                            try:
                                base_dir = os.path.dirname(os.path.abspath(__file__))
                                clean_folder = folder_name.strip().replace('\\', '/').lstrip('/')
                                target_dir = os.path.join(base_dir, clean_folder)
                                os.makedirs(target_dir, exist_ok=True)
                                
                                safe_dt = datetime.datetime.now().strftime("%d_%m_%Y_%H_%M")
                                f_path = os.path.join(target_dir, f"{dev_id.replace('+', '').replace(':', '')}_{safe_dt}_sch.json")
                                with open(f_path, 'w') as fh:
                                    fh.write(result_payload)
                            except Exception as file_err:
                                print(f"Local Store ERROR: {file_err}")

                        # Push to Scheduled JSON Track Record
                        payload_type = formatter.get('payload_type') or 'Scheduled'
                        cursor.execute("INSERT INTO tblScheduledJsonHistory (deviceid, json_payload, payload_type) VALUES (%s, %s::jsonb, %s)", 
                                      (dev_id, result_payload, payload_type))
                                      
                        # Push to Dead letter Queue target
                        cursor.execute("INSERT INTO tblDeadLetterQueue (deviceid, payload, targetUrl) VALUES (%s, %s, %s)", 
                                      (dev_id, result_payload, "https://api.external.com/submit"))
                                      
                        # Document execution time internally
                        schedule_id = formatter.get('schedule_id')
                        if schedule_id:
                            cursor.execute("UPDATE tblScheduler SET last_run = NOW() WHERE slno=%s", (schedule_id,))
                                      
                orchestrated_devices.add(dev_id)
                
            # Batch update ALL the processed rows natively at the end of the generator loop once
            if processed_slnos:
                cursor.execute("UPDATE tblDatareceiver SET isProcessed=1, processedOn=NOW() WHERE slno = ANY(%s)", (processed_slnos,))
            conn.commit()
    except Exception as e:
        print(f"Orchestration Error: {e}")
    finally:
        if conn:
            conn.close()

def process_dlq():
    """
    DLQ Engine: Retries failed JSON API posts.
    """
    print("Running process_dlq job...")
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT slno, deviceid, payload, targetUrl, retryCount FROM tblDeadLetterQueue WHERE isDeleted=0 AND retryCount < 5 LIMIT 50")
            rows = cursor.fetchall()
            
            for row in rows:
                slno = row['slno']
                url = row['targetUrl']
                payload_str = row['payload']
                
                try:
                    payload = json.loads(payload_str)
                    res = requests.post(url, json=payload, timeout=5)
                    if res.status_code in [200, 201]:
                        cursor.execute("UPDATE tblDeadLetterQueue SET isDeleted=1 WHERE slno=%s", (slno,))
                        cursor.execute("INSERT INTO tblPostHistory (deviceid, payload, targetUrl, responseStatus) VALUES (%s, %s, %s, %s)",
                                       (row['deviceid'], payload_str, url, str(res.status_code)))
                    else:
                        cursor.execute("UPDATE tblDeadLetterQueue SET retryCount=retryCount+1, errorReason=%s WHERE slno=%s", (f"HTTP {res.status_code}", slno))
                except Exception as e:
                    cursor.execute("UPDATE tblDeadLetterQueue SET retryCount=retryCount+1, errorReason=%s WHERE slno=%s", (str(e), slno))
                    
            conn.commit()
    except Exception as e:
        print(f"DLQ Error: {e}")
    finally:
        if conn:
            conn.close()

def aggregate_minute_data():
    """
    Minutes Aggregation Engine: Summarizes IoT data mathematically.
    """
    print("Running Minute Data Aggregator...")
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            # 1. Fetch unaggregated rows natively capping at fully elapsed minutes exactly preventing mid-minute incomplete overlaps mathematically gracefully properly explicitly securely cleanly gracefully explicitly.
            cursor.execute("SELECT slno, deviceid, revtext, receivedon FROM tblDatareceiver WHERE isAggregated=0 AND receivedon < DATE_TRUNC('minute', NOW()) ORDER BY receivedon ASC LIMIT 500")
            unaggregated = cursor.fetchall()
            
            if not unaggregated:
                return

            from collections import defaultdict
            import json
            
            # grouped_data[dev_id][minute_block_datetime] = list of tuples (slno, parsed_dict)
            grouped_data = defaultdict(lambda: defaultdict(list))
            
            for row in unaggregated:
                slno = row.get('slno')
                dev_id = row.get('deviceid')
                raw_text = row.get('revtext') or row.get('revText')
                rec_on = row.get('receivedon') or row.get('receivedOn')
                
                if not rec_on:
                    continue
                
                # Floor datetime to strict minute block
                minute_block = rec_on.replace(second=0, microsecond=0)
                
                # Parse "DT:17:57:27,IN:1394,OUT:1352..."
                parsed = {}
                if raw_text:
                    for part in raw_text.split(','):
                        if ':' in part:
                            # Split on first colon only
                            parts = part.split(':', 1)
                            if len(parts) == 2:
                                k = parts[0].strip().upper() # Case Insensitive
                                v = parts[1].strip()
                                try:
                                    parsed[k] = float(v)
                                except ValueError:
                                    parsed[k] = v
                                
                grouped_data[dev_id][minute_block].append((slno, parsed))

            # Mathematical Aggregation logic
            for dev_id, blocks in grouped_data.items():
                cursor.execute("""
                    SELECT m.api_rev_tag, p.valueFactor, p.datatype, p.decimalplaces, p.labelName, p.status_conditions
                    FROM tblDeviceParameterMapping m 
                    JOIN tblParameterMaster p ON m.parameter_id = p.slno 
                    WHERE m.deviceid = %s AND m.isDeleted = 0 AND p.status = 1
                """, (dev_id,))
                
                mappings = cursor.fetchall()
                
                # Cache for start-of-day values for SUM logic: (dev_id, date_obj, tag_upper) -> float
                start_of_day_cache = {}
                
                for minute_block, records in blocks.items():
                    minute_metrics = {}
                    
                    if mappings:
                        for mapping in mappings:
                            tag_raw = mapping.get('api_rev_tag')
                            if not tag_raw:
                                continue
                            
                            tag = tag_raw.upper() # Case Insensitive Mapping
                            v_factor = (mapping.get('valuefactor') or mapping.get('valueFactor') or 'Avg').upper()
                            
                            # Gather all values for this tag
                            values = []
                            for r in records:
                                payload = r[1]
                                if tag in payload:
                                    values.append(payload[tag])
                                    
                            if not values:
                                continue
                                
                            metric_val = None
                            # Separate numerics for mathematical safety
                            numeric_vals = [v for v in values if isinstance(v, (int, float))]
                            if tag in ['IN', 'OUT']:
                                if numeric_vals:
                                    current_max = max(numeric_vals)
                                    current_min = min(numeric_vals)
                                    metric_val = max(0, round(current_max - current_min, 2))
                                    minute_metrics[f"{tag}_RAW"] = current_max
                                else:
                                    metric_val = 0
                            elif v_factor in ['AVG', 'SUM']:
                                if numeric_vals:
                                    if v_factor == 'AVG':
                                        metric_val = round(sum(numeric_vals) / len(numeric_vals), 2)
                                    else: # SUM is Daily Cumulative
                                        current_max = max(numeric_vals)
                                        current_min = min(numeric_vals)
                                        
                                        # Strict Delta for the exact given minute (Max-Min trick requested by user)
                                        metric_val = max(0, round(current_max - current_min, 2))
                                        
                                        # Automatically store the RAW anchor transparently in the background for PCD calculation perfectly
                                        minute_metrics[f"{tag}_RAW"] = current_max
                            elif v_factor == 'MAX':
                                metric_val = max(numeric_vals) if numeric_vals else max(values)
                            elif v_factor == 'MIN':
                                metric_val = min(numeric_vals) if numeric_vals else min(values)
                            elif v_factor == 'FIRST':
                                metric_val = values[0]
                            elif v_factor == 'LAST':
                                metric_val = values[-1]
                            else: # Default Fallback to Avg
                                if numeric_vals:
                                    metric_val = round(sum(numeric_vals) / len(numeric_vals), 2)
                                else:
                                    metric_val = values[-1] # fallback to text value
                                    
                            if metric_val is not None:
                                data_type = mapping.get('datatype') or 'Decimal'
                                dec_places = mapping.get('decimalplaces')
                                if dec_places is None:
                                    dec_places = 2
                                    
                                if data_type == 'Number':
                                    try:
                                        metric_val = int(round(float(metric_val)))
                                    except ValueError:
                                        pass
                                elif data_type == 'Decimal':
                                    try:
                                        metric_val = round(float(metric_val), dec_places)
                                    except ValueError:
                                        pass
                                elif data_type == 'Text':
                                    metric_val = str(metric_val)

                                minute_metrics[tag_raw] = metric_val

                                # Evaluate Logical Parameter Bounds cleanly
                                conds_raw = mapping.get('status_conditions')
                                label_name = mapping.get('labelname')

                                if conds_raw and label_name:
                                    conds = []
                                    if isinstance(conds_raw, str):
                                        try:
                                            conds = json.loads(conds_raw)
                                        except: pass
                                    else:
                                        conds = conds_raw
                                    
                                    status_met = None
                                    for c in conds:
                                        try:
                                            v1 = float(c.get('val1', 0))
                                            v2 = float(c.get('val2', 0) if c.get('val2') is not None else 0.0)
                                            op = c.get('operator')
                                            label = c.get('label')
                                            
                                            mv = float(metric_val) # Compare cleanly mathematically
                                            
                                            if op == '<' and mv < v1: status_met = label
                                            elif op == '<=' and mv <= v1: status_met = label
                                            elif op == '=' and mv == v1: status_met = label
                                            elif op == '>=' and mv >= v1: status_met = label
                                            elif op == '>' and mv > v1: status_met = label
                                            elif op == 'BETWEEN' and min(v1, v2) <= mv <= max(v1, v2): status_met = label
                                            
                                            if status_met:
                                                break
                                        except (ValueError, TypeError): 
                                            pass
                                            
                                    if status_met:
                                        minute_metrics[f"{label_name} Status"] = status_met
                    
                    if minute_metrics:
                        # Insert into tblMinuteDetails with single-row structural Upsert mapping gracefully
                        cursor.execute("""
                            INSERT INTO tblMinuteDetails (deviceid, minute_date, minute_time, metrics) 
                            VALUES (%s, %s, %s, %s)
                            ON CONFLICT (deviceid, minute_date, minute_time) 
                            DO UPDATE SET metrics = EXCLUDED.metrics
                        """, (
                            dev_id, 
                            minute_block.date(), 
                            minute_block.time(), 
                            json.dumps(minute_metrics)
                        ))

                    # Finally, update these particular records to isAggregated=1
                    slnos = [r[0] for r in records]
                    if slnos:
                        format_strings = ','.join(['%s'] * len(slnos))
                        cursor.execute(f"UPDATE tblDatareceiver SET isAggregated=1, aggregatedOn=NOW() WHERE slno IN ({format_strings})", tuple(slnos))

            conn.commit()
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Minute Aggregator Error: {e}")
    finally:
        if conn:
            conn.close()

def db_cleanup_job():
    print("Running db_cleanup_job...")
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(f"DELETE FROM tblDatareceiver WHERE receivedOn < NOW() - INTERVAL '{DB_RETENTION_DAYS} days'")
            conn.commit()
    except Exception as e:
        print(f"Cleanup Error: {e}")
    finally:
        if conn:
            conn.close()

def disk_cleanup_job():
    print(f"Running disk_cleanup_job for files older than {LOG_RETENTION_DAYS} days...")
    base_dir = os.path.dirname(os.path.abspath(__file__))
    directories_to_clean = [
        os.path.join(base_dir, "ErrorLogs"),
        os.path.join(base_dir, "EventLogs"),
        os.path.join(base_dir, "JSONLogs")
    ]
    
    current_time = time.time()
    cutoff_time = current_time - (LOG_RETENTION_DAYS * 86400)
    
    for dir_path in directories_to_clean:
        if not os.path.exists(dir_path):
            continue
            
        for filename in os.listdir(dir_path):
            file_path = os.path.join(dir_path, filename)
            if os.path.isfile(file_path):
                file_mtime = os.path.getmtime(file_path)
                if file_mtime < cutoff_time:
                    try:
                        os.remove(file_path)
                        print(f"Deleted old log file: {file_path}")
                    except Exception as e:
                        print(f"Failed to delete {file_path}: {e}")

def evaluate_active_alerts():
    '''
    Alert Dispatch Engine: Validates threshold limits & manages AlertSequence states natively.
    Runs constantly mapped to the Dispatch Frequency.
    '''
    print("Running evaluate_active_alerts...")
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            # 1. Fetch devices with alert dispatch configuration 
            cursor.execute("""
                SELECT dm.deviceid, s.alert_freq, s.param_alert_freq, s.post_url_live, s.post_url_staging, f.jsonTemplate, f.storedProcedureName
                FROM tblDeviceMaster dm
                JOIN tblScheduler s ON dm.customer_code = s.customer_code
                JOIN tblDeviceJsonMapping m ON dm.customer_code = m.customer_code
                JOIN tblJsonFormatter f ON m.scheduledJsonId = f.slno
                WHERE s.alert_req = true AND f.isDeleted = 0 AND dm.isDeleted = 0 AND dm.active = 1
            """)
            devices = cursor.fetchall()
            
            for dev in devices:
                dev_id = dev['deviceid']
                base_alert_freq = dev['alert_freq'] or 5
                sp_name = dev['storedprocedurename'] or dev['storedprocedureName']
                template = dev['jsontemplate'] or dev['jsonTemplate']
                target_url = dev['post_url_live'] or "https://api.external.com/submit"
                if not sp_name: continue
                
                # Natively extract Configurator block mappings
                param_freqs = dev.get('param_alert_freq') or {}
                if isinstance(param_freqs, str):
                    try: param_freqs = json.loads(param_freqs)
                    except: param_freqs = {}
                def_freqs = {'TVOC': base_alert_freq, 'PCH': base_alert_freq, 'PCD': base_alert_freq}
                
                # Evaluate current state mathematically natively from Postgres SP logic
                cursor.execute(f"SELECT * FROM {sp_name}(%s)", (dev_id,))
                current_state = cursor.fetchone()
                if not current_state: continue
                
                # Detect Active Broken Parameters
                active_bads = []
                if current_state.get('tvoc_bad') is not None and float(current_state.get('tvoc_bad')) > 0: active_bads.append('TVOC')
                if current_state.get('pcd_bad') is not None and float(current_state.get('pcd_bad')) > 0: active_bads.append('PCD')
                if current_state.get('pch_bad') is not None and float(current_state.get('pch_bad')) > 0: active_bads.append('PCH')
                
                cursor.execute("SELECT * FROM tblAlertMonitor WHERE deviceid=%s AND is_resolved=FALSE", (dev_id,))
                monitors = cursor.fetchall()
                monitor_map = {m['param_tag']: m for m in monitors}
                
                now = datetime.datetime.now()
                needs_dispatch = False
                dispatch_type = None
                newly_resolved_count = 0
                out_sequences = {'TVOC': 0, 'PCH': 0, 'PCD': 0}
                
                for p in ['TVOC', 'PCH', 'PCD']:
                    freq = param_freqs.get(p, def_freqs.get(p, 15))
                    mon = monitor_map.get(p)
                    is_bad = p in active_bads
                    
                    if is_bad:
                        if not mon:
                            # 1st Strike! Just monitor it, don't dispatch yet
                            cursor.execute("""
                                INSERT INTO tblAlertMonitor (deviceid, param_tag, sequence_count, last_checked_on, created_on, is_resolved)
                                VALUES (%s, %s, 0, %s, %s, FALSE)
                            """, (dev_id, p, now, now))
                            out_sequences[p] = 0
                        else:
                            last_check = mon['last_checked_on'] if 'last_checked_on' in mon else mon.get('last_checked_on')
                            mins_elapsed = (now - last_check).total_seconds() / 60.0
                            seq = mon['sequence_count'] if 'sequence_count' in mon else mon.get('sequence_count')
                            
                            if mins_elapsed >= freq:
                                seq += 1
                                slno = mon['slno'] if 'slno' in mon else mon.get('slno')
                                cursor.execute("UPDATE tblAlertMonitor SET sequence_count=%s, last_checked_on=%s WHERE slno=%s", (seq, now, slno))
                                needs_dispatch = True
                                dispatch_type = "threshold_breach"
                                
                            out_sequences[p] = seq
                    else:
                        if mon:
                            slno = mon['slno'] if 'slno' in mon else mon.get('slno')
                            cursor.execute("UPDATE tblAlertMonitor SET is_resolved=TRUE, resolved_on=%s WHERE slno=%s", (now, slno))
                            newly_resolved_count += 1
                            out_sequences[p] = 0
                
                # Global Resolution Check -> ONLY emit if absolutely zero params are currently bad, and we just resolved something.
                if newly_resolved_count > 0 and len(active_bads) == 0:
                    needs_dispatch = True
                    dispatch_type = "threshold_resolved"
                    
                if needs_dispatch:
                    overrides = {
                        'triggered_by': dispatch_type,
                        'tvoc_consecutive_bad': out_sequences['TVOC'],
                        'pch_consecutive_bad': out_sequences['PCH'],
                        'pcd_consecutive_bad': out_sequences['PCD']
                    }
                    overrides['alert_sequence'] = max(list(out_sequences.values()) + [0])
                    
                    payload = _parse_template(template, sp_name, dev_id, overrides)
                    cursor.execute("INSERT INTO tblDeadLetterQueue (deviceid, payload, targetUrl) VALUES (%s, %s, %s)", (dev_id, payload, target_url))
            
            conn.commit()
    except Exception as e:
        print(f"Alert Dispatch Engine Error: {e}")
    finally:
        if conn: conn.close()

def evaluate_tvoc_bucket_stream():
    """
    Independent 1-minute sweep picking up fresh IoT bursts natively for Alert Bucket states.
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT slno, deviceid, revText, receivedOn FROM tblDatareceiver WHERE isAlertProcessed=0 LIMIT 2000")
            unprocessed = cursor.fetchall()
            
            if not unprocessed:
                return
                
            processed_slnos = []
            
            for row in unprocessed:
                _slno = row['slno']
                processed_slnos.append(_slno)
                _dev_id = row['deviceid']
                _rev_text = row.get('revtext') or row.get('revText', '')
                _received_on = row['receivedon'] if 'receivedon' in row else row.get('receivedOn')
                
                try:
                    voc_match = re.search(r'VOC:([-0-9.]+)', _rev_text)
                    sh2s_match = re.search(r'SH2S:([-0-9.]+)', _rev_text)
                    
                    if voc_match and sh2s_match:
                        raw_sum = float(voc_match.group(1)) + float(sh2s_match.group(1))
                        sum_val = min(15.00, round(raw_sum, 2))
                        now = datetime.datetime.now()
                        
                        cursor.execute("SELECT * FROM tblAlertBucketTVOC WHERE DeviceId=%s AND isResolved=0 ORDER BY slno DESC LIMIT 1", (_dev_id,))
                        open_bucket = cursor.fetchone()
                        
                        if sum_val > 12.00:
                            if not open_bucket:
                                cursor.execute("""
                                    INSERT INTO tblAlertBucketTVOC (DeviceId, CDatetime, tvoc_value, count, isResolved, continousbad, lastupdatedon, currentstatus)
                                    VALUES (%s, %s, %s, 0, 0, 0, %s, 'Bad')
                                """, (_dev_id, _received_on, sum_val, now))
                            else:
                                b_slno = open_bucket['slno']
                                c_datetime = open_bucket.get('cdatetime')
                                diff_mins = int((now - c_datetime).total_seconds() / 60.0) if c_datetime else 0
                                cursor.execute("""
                                    UPDATE tblAlertBucketTVOC 
                                    SET tvoc_value=%s, continousbad=%s, lastupdatedon=%s 
                                    WHERE slno=%s
                                """, (sum_val, diff_mins, now, b_slno))
                        else:
                            # We deliberately do NOTHING if it's <= 12.00 here. 
                            # The 5-minute watchdog dispatcher will evaluate the history to officially close buckets!
                            pass
                except Exception as ex:
                    print("Bucket Parser Error:", ex)

            # Mark processed for TVOC alert exclusively
            if processed_slnos:
                placeholders = ','.join(['%s'] * len(processed_slnos))
                cursor.execute(f"UPDATE tblDatareceiver SET isAlertProcessed=1 WHERE slno IN ({placeholders})", tuple(processed_slnos))
            conn.commit()
    except Exception as e:
        print("TVOC Bucket Stream Error:", e)
    finally:
        if conn: conn.close()

def dispatch_tvoc_alerts_job():
    print("Running TVOC Alert Dispatcher...")
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            # 1. Fetch Formatter for Alert
            cursor.execute("SELECT f.jsonTemplate, f.storedProcedureName FROM tblJsonFormatter f WHERE f.name='woloo_scheduled_json' AND f.isDeleted=0 LIMIT 1")
            formatter = cursor.fetchone()
            
            if not formatter or not formatter.get('jsontemplate'):
                return
                
            template = formatter.get('jsontemplate') or formatter.get('jsonTemplate')
            sp_name = formatter.get('storedprocedurename') or formatter.get('storedProcedureName')
            
            # 2. Iterate Active Alerts (isResolved=0) -> Dynamic 5-minute checkpoint
            cursor.execute("SELECT * FROM tblAlertBucketTVOC WHERE isResolved=0")
            active_alerts = cursor.fetchall()
            now = datetime.datetime.now()
            
            for b in active_alerts:
                dev_id = b.get('deviceid')
                b_slno = b.get('slno')
                c_datetime = b.get('cdatetime')
                sequence_count = b.get('count', 0)
                
                # Safely fallback to 'now' if c_datetime is magically missing
                if not c_datetime:
                    c_datetime = now
                    
                target_check_time = c_datetime + datetime.timedelta(minutes=5 * (sequence_count + 1))
                
                if now < target_check_time:
                    continue  # We haven't hit the next 5-minute block threshold yet. Skip!
                
                eval_start_time = target_check_time - datetime.timedelta(minutes=5)
                
                cursor.execute("""
                    SELECT revText FROM tblDatareceiverHistory 
                    WHERE deviceid=%s AND receivedOn > %s AND receivedOn <= %s
                """, (dev_id, eval_start_time, target_check_time))
                block_rows = cursor.fetchall()
                
                is_still_bad = False
                highest_tvoc_in_block = float(b.get('tvoc_value', 0) or 0)
                
                for br in block_rows:
                    voc_match = re.search(r'VOC:([-0-9.]+)', br['revtext'])
                    sh2s_match = re.search(r'SH2S:([-0-9.]+)', br['revtext'])
                    if voc_match and sh2s_match:
                        sum_val = min(15.00, round(float(voc_match.group(1)) + float(sh2s_match.group(1)), 2))
                        if sum_val > highest_tvoc_in_block:
                            highest_tvoc_in_block = sum_val
                        if sum_val > 12.00:
                            is_still_bad = True
                
                # If no data point found but it was previously bad, it remains officially undetermined (err on side of active alert) 
                # strictly following 5 min checking logic as per user. Wait, if NO data was received, we should probably assume bad. 
                # For safety, let's trigger it.
                diff_mins = int((now - c_datetime).total_seconds() / 60.0)
                
                if is_still_bad or not block_rows:
                    # Alert continues to be BAD. Fire Sequence iteration!
                    cursor.execute("SELECT s.post_url_live FROM tblDeviceMaster dm JOIN tblScheduler s ON dm.customer_code = s.customer_code WHERE dm.deviceid=%s LIMIT 1", (dev_id,))
                    s_row = cursor.fetchone()
                    target_url = s_row['post_url_live'] if s_row else ''
                    
                    overrides = {
                        'triggered_by': 'threshold_breach', 
                        'alert_sequence': sequence_count + 1, 
                        'tvoc_bad': diff_mins, 
                        'parameters': 'tvoc',
                        'tvoc': {'value': highest_tvoc_in_block, 'unit': 'ppm', 'condition': 'BAD'}
                    }
                    payload = _parse_template(template, sp_name, dev_id, overrides)
                    if target_url:
                        cursor.execute("INSERT INTO tblDeadLetterQueue (deviceid, payload, targetUrl) VALUES (%s, %s, %s)", (dev_id, payload, target_url))
                    cursor.execute("INSERT INTO tblScheduledJsonHistory (deviceid, json_payload, payload_type) VALUES (%s, %s::jsonb, %s)", (dev_id, payload, 'Alert'))
                    try:
                        from logger import JSON_LOG_DIR
                        safe_dt = datetime.datetime.now().strftime("%d_%m_%Y_%H_%M")
                        target_dir = os.path.join(JSON_LOG_DIR, "Woloo", "Alert")
                        os.makedirs(target_dir, exist_ok=True)
                        f_path = os.path.join(target_dir, f"{dev_id.replace(':', '').replace('+', '')}_{safe_dt}_Alert_Tvoc.json")
                        with open(f_path, 'w', encoding='utf-8') as fh: fh.write(payload)
                    except Exception as e: print("File Save Error:", e)
                    
                    cursor.execute("UPDATE tblAlertBucketTVOC SET count = count + 1, lastupdatedon=%s, continousbad=%s, tvoc_value=%s WHERE slno=%s", (now, diff_mins, highest_tvoc_in_block, b_slno))
                else:
                    # Resolution! No bad points observed in the specific exact 5 min gap.
                    cursor.execute("UPDATE tblAlertBucketTVOC SET isResolved=1, currentstatus='Good', statuschangedon=%s, lastupdatedon=%s, continousbad=%s, tvoc_value=%s WHERE slno=%s", (now, now, diff_mins, highest_tvoc_in_block, b_slno))
            
            # 3. Iterate Resolved Alerts (never sent)
            cursor.execute("SELECT * FROM tblAlertBucketTVOC WHERE isResolved=1 AND ResolvedalertSentOn IS NULL")
            resolved_alerts = cursor.fetchall()
            now = datetime.datetime.now()
            for b in resolved_alerts:
                dev_id = b.get('deviceid')
                b_slno = b.get('slno')
                cursor.execute("""
                    SELECT s.post_url_live FROM tblDeviceMaster dm 
                    JOIN tblScheduler s ON dm.customer_code = s.customer_code WHERE dm.deviceid=%s LIMIT 1
                """, (dev_id,))
                s_row = cursor.fetchone()
                target_url = s_row['post_url_live'] if s_row else ''
                diff_mins = int(b.get('continousbad', 0) or 0)
                exact_tvoc_value = float(b.get('tvoc_value', 0) or 0)
                overrides = {
                    'triggered_by': 'threshold_resolved', 
                    'alert_sequence': max(1, b.get('count', 1)), 
                    'tvoc_bad': diff_mins, 
                    'parameters': 'tvoc',
                    'tvoc': {'value': exact_tvoc_value, 'unit': 'ppm', 'condition': 'GOOD'}
                }
                payload = _parse_template(template, sp_name, dev_id, overrides)
                if target_url:
                    cursor.execute("INSERT INTO tblDeadLetterQueue (deviceid, payload, targetUrl) VALUES (%s, %s, %s)", (dev_id, payload, target_url))
                cursor.execute("INSERT INTO tblScheduledJsonHistory (deviceid, json_payload, payload_type) VALUES (%s, %s::jsonb, %s)", (dev_id, payload, 'Resolved'))
                try:
                    from logger import JSON_LOG_DIR
                    safe_dt = datetime.datetime.now().strftime("%d_%m_%Y_%H_%M")
                    target_dir = os.path.join(JSON_LOG_DIR, "Woloo", "Resolved")
                    os.makedirs(target_dir, exist_ok=True)
                    f_path = os.path.join(target_dir, f"{dev_id.replace(':', '').replace('+', '')}_{safe_dt}_AlertResolved_Tvoc.json")
                    with open(f_path, 'w', encoding='utf-8') as fh: fh.write(payload)
                except Exception as e: print("File Save Error:", e)
                cursor.execute("UPDATE tblAlertBucketTVOC SET ResolvedalertSentOn=%s WHERE slno=%s", (now, b_slno))
            
            conn.commit()
    except Exception as e:
        print("Dispatch TVOC Error:", e)
    finally:
        if conn: conn.close()

def dispatch_pch_alerts_job():
    print("Running PCH Alert Dispatcher (15 Min Maintenance)...")
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT peoplelimit FROM tblcustomermaster WHERE customername ILIKE '%woloo%' LIMIT 1")
            th_row = cursor.fetchone()
            threshold = float(th_row['peoplelimit']) if th_row and th_row['peoplelimit'] is not None else 10.0
            
            cursor.execute("SELECT jsontemplate, storedprocedurename FROM tbljsonformatter WHERE name='woloo_scheduled_json' AND isdeleted=0 LIMIT 1")
            formatter = cursor.fetchone()
            if not formatter: return
            
            cursor.execute("SELECT * FROM tblalertbucketpch WHERE isresolved=0")
            active_alerts = cursor.fetchall()
            now = datetime.datetime.now()
            
            import re
            for b in active_alerts:
                dev_id = b.get('deviceid')
                b_slno = b.get('slno')
                c_datetime = b.get('cdatetime')
                sequence_count = b.get('count', 0)
                if not c_datetime: c_datetime = now
                
                target_check_time = c_datetime + datetime.timedelta(minutes=15 * sequence_count)
                
                if now < target_check_time:
                    continue
                
                eval_start_time = target_check_time - datetime.timedelta(minutes=15)
                
                cursor.execute("""
                    SELECT revText FROM tblDatareceiverHistory 
                    WHERE deviceid=%s AND receivedOn > %s AND receivedOn <= %s
                """, (dev_id, eval_start_time, target_check_time))
                block_rows = cursor.fetchall()
                outs = []
                for br in block_rows:
                    m = re.search(r'OUT:([-0-9.]+)', br['revtext'])
                    if m: outs.append(float(m.group(1)))
                
                if outs:
                    delta = max(outs) - min(outs)
                    diff_mins = int((now - c_datetime).total_seconds() / 60.0) if c_datetime else 0
                    
                    
                    cursor.execute("SELECT s.post_url_live FROM tblDeviceMaster dm JOIN tblScheduler s ON dm.customer_code = s.customer_code WHERE dm.deviceid=%s LIMIT 1", (dev_id,))
                    s_row = cursor.fetchone()
                    target_url = s_row['post_url_live'] if s_row else ''
                    
                    template = formatter.get('jsontemplate') or formatter.get('jsonTemplate')
                    sp_name = formatter.get('storedprocedurename') or formatter.get('storedProcedureName')
                    
                    if delta > threshold:
                        cursor.execute("UPDATE tblalertbucketpch SET count = count + 1, continousbad=%s, lastupdatedon=%s WHERE slno=%s", (diff_mins, now, b_slno))
                        overrides = {
                            'triggered_by': 'PCH Level Threshold Breach', 
                            'alert_sequence': b['count'], 
                            'pcd_bad': diff_mins, 
                            'pch_bad': diff_mins, 
                            'parameters': 'pch',
                            'pch': {'value': delta, 'unit': '', 'pch_in': 0, 'condition': 'BAD'}
                        }
                        payload = _parse_template(template, sp_name, dev_id, overrides)
                        if target_url:
                            cursor.execute("INSERT INTO tblDeadLetterQueue (deviceid, payload, targetUrl) VALUES (%s, %s, %s)", (dev_id, payload, target_url))
                        cursor.execute("INSERT INTO tblScheduledJsonHistory (deviceid, json_payload, payload_type) VALUES (%s, %s::jsonb, %s)", (dev_id, payload, 'Alert'))
                        try:
                            from logger import JSON_LOG_DIR
                            safe_dt = datetime.datetime.now().strftime("%d_%m_%Y_%H_%M")
                            target_dir = os.path.join(JSON_LOG_DIR, "Woloo", "Alert")
                            os.makedirs(target_dir, exist_ok=True)
                            f_path = os.path.join(target_dir, f"{dev_id.replace(':', '').replace('+', '')}_{safe_dt}_Alert_Pch.json")
                            with open(f_path, 'w', encoding='utf-8') as fh: fh.write(payload)
                        except Exception as e: print("File Save Error:", e)
                    else:
                        cursor.execute("UPDATE tblalertbucketpch SET isresolved=1, currentstatus='Good', statuschangedon=%s, continousbad=%s WHERE slno=%s", (now, diff_mins, b_slno))
                        cursor.execute("UPDATE tblalertbucketpch SET resolvedalertsenton=%s WHERE slno=%s", (now, b_slno))
                        overrides = {
                            'triggered_by': 'PCH Level Threshold Resolved', 
                            'alert_sequence': max(1, b['count']), 
                            'pcd_bad': diff_mins, 
                            'pch_bad': diff_mins, 
                            'parameters': 'pch',
                            'pch': {'value': delta, 'unit': '', 'pch_in': 0, 'condition': 'GOOD'}
                        }
                        payload = _parse_template(template, sp_name, dev_id, overrides)
                        if target_url:
                            cursor.execute("INSERT INTO tblDeadLetterQueue (deviceid, payload, targetUrl) VALUES (%s, %s, %s)", (dev_id, payload, target_url))
                        cursor.execute("INSERT INTO tblScheduledJsonHistory (deviceid, json_payload, payload_type) VALUES (%s, %s::jsonb, %s)", (dev_id, payload, 'Resolved'))
                        try:
                            from logger import JSON_LOG_DIR
                            safe_dt = datetime.datetime.now().strftime("%d_%m_%Y_%H_%M")
                            target_dir = os.path.join(JSON_LOG_DIR, "Woloo", "Resolved")
                            os.makedirs(target_dir, exist_ok=True)
                            f_path = os.path.join(target_dir, f"{dev_id.replace(':', '').replace('+', '')}_{safe_dt}_Alert_Pch.json")
                            with open(f_path, 'w', encoding='utf-8') as fh: fh.write(payload)
                        except Exception as e: print("File Save Error:", e)
                else:
                    diff_mins = int((now - c_datetime).total_seconds() / 60.0) if c_datetime else 0
                    cursor.execute("UPDATE tblalertbucketpch SET isresolved=1, currentstatus='Good', statuschangedon=%s, continousbad=%s WHERE slno=%s", (now, diff_mins, b_slno))
                    cursor.execute("UPDATE tblalertbucketpch SET resolvedalertsenton=%s WHERE slno=%s", (now, b_slno))
                    
                    cursor.execute("SELECT s.post_url_live FROM tblDeviceMaster dm JOIN tblScheduler s ON dm.customer_code = s.customer_code WHERE dm.deviceid=%s LIMIT 1", (dev_id,))
                    s_row = cursor.fetchone()
                    target_url = s_row['post_url_live'] if s_row else ''
                    
                    template = formatter.get('jsontemplate') or formatter.get('jsonTemplate')
                    sp_name = formatter.get('storedprocedurename') or formatter.get('storedProcedureName')
                    
                    overrides = {
                        'triggered_by': 'PCH Level Threshold Resolved', 
                        'alert_sequence': max(1, b['count']), 
                        'pcd_bad': diff_mins, 
                        'pch_bad': diff_mins,
                        'parameters': 'pch',
                        'pch': {'value': 0, 'unit': '', 'pch_in': 0, 'condition': 'GOOD'}
                    }
                    payload = _parse_template(template, sp_name, dev_id, overrides)
                    if target_url:
                        cursor.execute("INSERT INTO tblDeadLetterQueue (deviceid, payload, targetUrl) VALUES (%s, %s, %s)", (dev_id, payload, target_url))
                    cursor.execute("INSERT INTO tblScheduledJsonHistory (deviceid, json_payload, payload_type) VALUES (%s, %s::jsonb, %s)", (dev_id, payload, 'Resolved'))
                    try:
                        from logger import JSON_LOG_DIR
                        safe_dt = datetime.datetime.now().strftime("%d_%m_%Y_%H_%M")
                        f_path = os.path.join(JSON_LOG_DIR, f"{dev_id.replace(':', '').replace('+', '')}_{safe_dt}_Alert_Pch.json")
                        with open(f_path, 'w', encoding='utf-8') as fh: fh.write(payload)
                    except Exception as e: print("File Save Error:", e)
                    
            conn.commit()
    except Exception as e:
        print("Dispatch PCH Error:", e)
    finally:
        if conn: conn.close()

def start_schedulers():
    scheduler = BackgroundScheduler()
    scheduler.add_job(orchestrate_json_payloads, 'cron', minute='14,29,44,59')
    scheduler.add_job(evaluate_active_alerts, 'cron', minute='14,29,44,59')
    scheduler.add_job(dispatch_pch_alerts_job, 'interval', minutes=1)
    scheduler.add_job(process_dlq, 'interval', minutes=2)
    
    scheduler.add_job(dispatch_tvoc_alerts_job, 'interval', minutes=1)
    scheduler.add_job(evaluate_tvoc_bucket_stream, 'interval', minutes=1)
    
    scheduler.add_job(db_cleanup_job, 'cron', hour=0, minute=0)
    scheduler.add_job(disk_cleanup_job, 'cron', hour=0, minute=5) # Runs slightly after DB cleanup
    scheduler.start()
    return scheduler
