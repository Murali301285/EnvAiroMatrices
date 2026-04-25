"""
Custom PCH alert engine based on tblMinuteDetails and tbl_pch_alert.

Runs every 15 minutes, checks timeframe, compares Max(OUT_RAW) - Min(OUT_RAW)
against threshold. Uses cooldown logic to avoid alert spam.
"""
from __future__ import annotations

import datetime
import os
import json
from database import get_db_connection
from .common import _parse_template, _dispatch_webhook, _get_alias

def evaluate_custom_pch_alerts():
    print("Running Custom PCH Alert Dispatcher (15 Min Sequence)...")
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            # 1. Fetch devices with configured PCH thresholds
            cursor.execute(
                "SELECT deviceid, customer_code, working_hours_json FROM tblDeviceMaster WHERE isDeleted=0 AND active=1"
            )
            devices = cursor.fetchall()
            
            # Fetch formatter
            cursor.execute(
                "SELECT jsontemplate, storedprocedurename FROM tbljsonformatter "
                "WHERE name='woloo_scheduled_json' AND isdeleted=0 LIMIT 1"
            )
            formatter = cursor.fetchone()
            if not formatter:
                return
            template = formatter.get("jsontemplate") or formatter.get("jsonTemplate")
            sp_name = formatter.get("storedprocedurename") or formatter.get("storedProcedureName")

            now = datetime.datetime.now()

            for dev in devices:
                whj = dev.get("working_hours_json") or {}
                if isinstance(whj, str):
                    try:
                        whj = json.loads(whj)
                    except:
                        whj = {}
                
                timeframe_mins = int(whj.get("pch_timeframe_mins", 0))
                threshold = int(whj.get("pch_threshold", 0))
                cooldown_mins = int(whj.get("pch_cooldown_mins", 30))
                
                if timeframe_mins <= 0 or threshold <= 0:
                    continue
                
                dev_id = dev["deviceid"]
                cust_code = dev["customer_code"]
                
                # Calculate evaluation window
                end_time = now
                start_time = now - datetime.timedelta(minutes=timeframe_mins)
                
                # Midnight rule: clamp to today's midnight if it crosses
                today_midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
                if start_time < today_midnight:
                    start_time = today_midnight

                # 2. Query tblMinuteDetails for OUT_RAW min/max
                cursor.execute(
                    """
                    SELECT 
                        MAX(CAST(metrics->>'OUT_RAW' AS NUMERIC)) as max_out, 
                        MIN(CAST(metrics->>'OUT_RAW' AS NUMERIC)) as min_out 
                    FROM tblMinuteDetails 
                    WHERE deviceid = %s AND (minute_date + minute_time) >= %s AND (minute_date + minute_time) <= %s
                    """,
                    (dev_id, start_time, end_time)
                )
                row = cursor.fetchone()
                if not row or row["max_out"] is None or row["min_out"] is None:
                    continue
                    
                max_count = int(row["max_out"])
                min_count = int(row["min_out"])
                pch_count = max_count - min_count
                
                if pch_count >= threshold:
                    # 3. Cooldown check
                    cooldown_start = now - datetime.timedelta(minutes=cooldown_mins)
                    cursor.execute(
                        "SELECT slno, created_on FROM tbl_pch_alert WHERE deviceid=%s AND created_on >= %s ORDER BY slno DESC LIMIT 1",
                        (dev_id, cooldown_start)
                    )
                    recent_alert = cursor.fetchone()
                    
                    if recent_alert:
                        # Inside cooldown
                        remarks = f"already alert generated at previously [{recent_alert['created_on'].strftime('%Y-%m-%d %H:%M:%S')}, ID: {recent_alert['slno']}]"
                        cursor.execute(
                            """
                            INSERT INTO tbl_pch_alert 
                            (deviceid, timeframe, from_datetime, to_datetime, Max_count, Min_count, PchCount, people_count_threshold_limit, isAlertrequired, isJsonCreated, isJSONposted, remarks)
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                            """,
                            (dev_id, timeframe_mins, start_time, end_time, max_count, min_count, pch_count, threshold, True, False, False, remarks)
                        )
                    else:
                        # Outside cooldown, generate alert
                        remarks = "Alert Triggered"
                        
                        # Generate JSON Payload
                        cursor.execute(
                            "SELECT s.post_url_live FROM tblScheduler s WHERE s.customer_code=%s LIMIT 1",
                            (cust_code,)
                        )
                        s_row = cursor.fetchone()
                        target_url = s_row["post_url_live"] if s_row else ""
                        
                        overrides = {
                            "triggered_by": "threshold_breach",
                            "alert_sequence": 1,
                            "pcd_bad": 0,
                            "pch_bad": 0,
                            "parameters": "pch",
                            "pch": {
                                "value": pch_count,
                                "unit": "",
                                "pch_in": 0,
                                "condition": "bad",
                            },
                        }
                        payload = _parse_template(template, sp_name, dev_id, overrides)
                        
                        if target_url:
                            _dispatch_webhook(dev_id, payload, cursor, "PCH Alert")
                            is_posted = True
                        else:
                            is_posted = False
                            
                        cursor.execute(
                            "INSERT INTO tblScheduledJsonHistory (deviceid, json_payload, payload_type) VALUES (%s, %s::jsonb, %s)",
                            (dev_id, payload, "Alert"),
                        )
                        _write_alert_file(payload, dev_id, cursor, subfolder="Alert", suffix="Alert_Pch")
                        
                        cursor.execute(
                            """
                            INSERT INTO tbl_pch_alert 
                            (deviceid, timeframe, from_datetime, to_datetime, Max_count, Min_count, PchCount, people_count_threshold_limit, isAlertrequired, isJsonCreated, isJSONposted, remarks)
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                            """,
                            (dev_id, timeframe_mins, start_time, end_time, max_count, min_count, pch_count, threshold, True, True, is_posted, remarks)
                        )
                        
            conn.commit()
    except Exception as e:
        print("Dispatch Custom PCH Error:", e)
    finally:
        if conn:
            conn.close()

def _write_alert_file(payload: str, dev_id: str, cursor, subfolder: str, suffix: str) -> None:
    try:
        from logger import JSON_LOG_DIR
        safe_dt = datetime.datetime.now().strftime("%d_%m_%Y_%H_%M")
        target_dir = os.path.join(JSON_LOG_DIR, "Woloo", subfolder) if subfolder else JSON_LOG_DIR
        os.makedirs(target_dir, exist_ok=True)
        f_name_id = _get_alias(dev_id, cursor)
        f_path = os.path.join(target_dir, f"{f_name_id.replace(':', '').replace('+', '')}_{safe_dt}_{suffix}.json")
        with open(f_path, "w", encoding="utf-8") as fh:
            fh.write(payload)
    except Exception as e:
        print("File Save Error:", e)
