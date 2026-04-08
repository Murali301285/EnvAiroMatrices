from fastapi import APIRouter, Request, Depends
from database import get_db_connection
from auth import verify_iot_secret
from ws_manager import manager
import json

router = APIRouter(prefix="/api/v1", tags=["IoT Receiver"])

@router.post("/receiver", dependencies=[Depends(verify_iot_secret)])
async def receive_iot_data(request: Request):
    try:
        data = await request.json()
    except Exception:
        data = dict(request.query_params)
        if not data:
            form = await request.form()
            data = dict(form)

    device_id = data.get("deviceid", data.get("deviceId"))
    rev_text = data.get("revText", data.get("revtext"))
    
    if not device_id or not rev_text:
        return "-1 Error: Missing deviceid or revText"

    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            # Validate deviceid exists in tblDeviceMaster
            cursor.execute("SELECT slno FROM tblDeviceMaster WHERE deviceid=%s AND isDeleted=0", (device_id,))
            if not cursor.fetchone():
                return "-1 Error: Unregistered Device"

            # Insert into main table with RETURNING statement for ID
            cursor.execute("INSERT INTO tblDatareceiver (deviceid, revText) VALUES (%s, %s) RETURNING slno", (device_id, rev_text))
            last_id_row = cursor.fetchone()
            last_id = last_id_row['slno']
            
            # Insert into history table
            cursor.execute("INSERT INTO tblDatareceiverHistory (slno, deviceid, revText, receivedOn) VALUES (%s, %s, %s, NOW())", (last_id, device_id, rev_text))
            
        # ====== PCH Real-Time Evaluator Hook ======
        try:
            import re
            import datetime
            out_match = re.search(r'OUT:([-0-9.]+)', rev_text)
            if out_match:
                # 1. Start by fetching threshold from tblcustomermaster
                cursor.execute("SELECT peoplelimit FROM tblcustomermaster WHERE customername ILIKE '%woloo%' LIMIT 1")
                th_row = cursor.fetchone()
                threshold = float(th_row['peoplelimit']) if th_row and th_row['peoplelimit'] is not None else 10.0
                
                # 2. Determine bounds for the CURRENT 15-minute clock cycle (e.g. 4:00 to 4:14:59)
                now = datetime.datetime.now()
                # Find the start of the block (0, 15, 30, 45)
                block_start_minute = (now.minute // 15) * 15
                block_start = now.replace(minute=block_start_minute, second=0, microsecond=0)
                
                # 3. Query Min and Max OUT strictly within this bounded time
                # We extract the OUT field from revText using regexp logic in postgres, or just query history and calculate in Python
                cursor.execute("""
                    SELECT revText FROM tblDatareceiverHistory 
                    WHERE deviceid=%s AND receivedOn >= %s AND receivedOn <= %s
                """, (device_id, block_start, now))
                block_rows = cursor.fetchall()
                
                outs = []
                for br in block_rows:
                    m = re.search(r'OUT:([-0-9.]+)', br['revtext'])
                    if m:
                        outs.append(float(m.group(1)))
                
                if outs:
                    delta = max(outs) - min(outs)
                    if delta > threshold:
                        # 4. Check if an ACTIVE bucket already exists
                        cursor.execute("SELECT slno FROM tblalertbucketpch WHERE deviceid=%s AND isresolved=0 LIMIT 1", (device_id,))
                        if not cursor.fetchone():
                            # INSERT into Bucket and generate FIRST json immediately
                            cursor.execute("""
                                INSERT INTO tblalertbucketpch (deviceid, CDatetime, people_count_delta, count, currentstatus, continousbad) 
                                VALUES (%s, %s, %s, 1, 'Bad', 0) RETURNING slno
                            """, (device_id, now, delta))
                            pch_slno = cursor.fetchone()['slno']
                            
                            # Format JSON payload via Parse Template
                            cursor.execute("SELECT jsontemplate, storedprocedurename FROM tbljsonformatter WHERE name='woloo_scheduled_json' AND isdeleted=0 LIMIT 1")
                            formatter = cursor.fetchone()
                            if formatter:
                                template = formatter.get('jsontemplate')
                                sp_name = formatter.get('storedprocedurename')
                                
                                cursor.execute("SELECT s.post_url_live FROM tblDeviceMaster dm JOIN tblScheduler s ON dm.customer_code = s.customer_code WHERE dm.deviceid=%s LIMIT 1", (device_id,))
                                s_row = cursor.fetchone()
                                target_url = s_row['post_url_live'] if s_row else ''
                                
                                from scheduler import _parse_template
                                overrides = {'triggered_by': 'PCH Level', 'alert_sequence': 1, 'pcd_bad': 0, 'pch_bad': 0, 'parameters': 'pch'}
                                payload = _parse_template(template, sp_name, device_id, overrides)
                                if target_url:
                                    cursor.execute("INSERT INTO tblDeadLetterQueue (deviceid, payload, targetUrl) VALUES (%s, %s, %s)", (device_id, payload, target_url))
                                cursor.execute("INSERT INTO tblScheduledJsonHistory (deviceid, json_payload, payload_type) VALUES (%s, %s::jsonb, %s)", (device_id, payload, 'Alert'))
                                try:
                                    from logger import JSON_LOG_DIR
                                    safe_dt = datetime.datetime.now().strftime("%d_%m_%Y_%H_%M")
                                    target_dir = os.path.join(JSON_LOG_DIR, "Woloo", "Alert")
                                    os.makedirs(target_dir, exist_ok=True)
                                    f_path = os.path.join(target_dir, f"{device_id.replace(':', '').replace('+', '')}_{safe_dt}_Alert_Pch.json")
                                    with open(f_path, 'w', encoding='utf-8') as fh: fh.write(payload)
                                except Exception as e: print("File Save Error:", e)
        except Exception as pch_e:
            print("PCH Real Time Eval Error:", pch_e)
        # ==========================================

        conn.commit()
        
        # Broadcast via websocket
        await manager.broadcast(json.dumps({"event": "new_data", "deviceid": device_id, "data": rev_text}))
        return "OK"
    except Exception as e:
        print(f"DB Error: {e}")
        return "-1 Error"
    finally:
        if conn:
            conn.close()
