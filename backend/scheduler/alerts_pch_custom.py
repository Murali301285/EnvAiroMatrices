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

            now = datetime.datetime.now().replace(second=0, microsecond=0)

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
                
                print(f"Checking dev: {dev['deviceid']} - timeframe: {timeframe_mins}, threshold: {threshold}")
                
                if timeframe_mins <= 0 or threshold <= 0:
                    continue
                
                dev_id = dev["deviceid"]
                cust_code = dev["customer_code"]
                
                # Apply 1-minute execution buffer (so script running at :15 evaluates up to :14)
                logical_now = datetime.datetime.now().replace(second=0, microsecond=0) - datetime.timedelta(minutes=1)
                
                end_time = logical_now
                # To make it perfectly inclusive (e.g. 15:15 to 16:14 = 60 mins), subtract timeframe - 1
                max_lookback = logical_now - datetime.timedelta(minutes=timeframe_mins - 1)
                
                # Fetch last alert time for this device
                cursor.execute(
                    "SELECT created_on FROM tbl_pch_alert WHERE deviceid=%s AND isAlertrequired=True ORDER BY slno DESC LIMIT 1",
                    (dev_id,)
                )
                last_alert_row = cursor.fetchone()
                
                if last_alert_row and last_alert_row["created_on"]:
                    start_time = max(last_alert_row["created_on"], max_lookback)
                else:
                    start_time = max_lookback
                
                # Midnight rule: clamp to today's midnight if it crosses
                today_midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
                if start_time < today_midnight:
                    start_time = today_midnight

                # 2. Query tblMinuteDetails minute-by-minute
                cursor.execute(
                    """
                    SELECT 
                        (minute_date + minute_time) as dt, 
                        CAST(metrics->>'OUT_RAW' AS NUMERIC) as out_raw 
                    FROM tblMinuteDetails 
                    WHERE deviceid = %s AND (minute_date + minute_time) >= %s AND (minute_date + minute_time) <= %s
                    ORDER BY (minute_date + minute_time) ASC
                    """,
                    (dev_id, start_time, end_time)
                )
                records = cursor.fetchall()
                
                if not records:
                    print(f"Skipping {dev_id}: No data in window {start_time} to {end_time}")
                    continue
                    
                min_out = None
                max_out = None
                breach_time = None
                
                for r in records:
                    val = r["out_raw"]
                    if val is None:
                        continue
                    val = int(val)
                    
                    if min_out is None or val < min_out:
                        min_out = val
                    if max_out is None or val > max_out:
                        max_out = val
                        
                    pch_count = max_out - min_out
                    if pch_count >= threshold:
                        breach_time = r["dt"]
                        break
                
                if min_out is None or max_out is None:
                    continue
                    
                pch_count = max_out - min_out
                
                if breach_time:
                    # 3. Cooldown check
                    cooldown_start = now - datetime.timedelta(minutes=cooldown_mins)
                    cursor.execute(
                        "SELECT slno, created_on FROM tbl_pch_alert WHERE deviceid=%s AND created_on >= %s AND isAlertrequired=True ORDER BY slno DESC LIMIT 1",
                        (dev_id, cooldown_start)
                    )
                    recent_alert = cursor.fetchone()
                    
                    if recent_alert:
                        # Inside cooldown
                        remarks = f"Threshold breached at {breach_time.strftime('%Y-%m-%d %H:%M:%S')} but inside cooldown (last alert: {recent_alert['created_on'].strftime('%Y-%m-%d %H:%M:%S')}, ID: {recent_alert['slno']})"
                        cursor.execute(
                            """
                            INSERT INTO tbl_pch_alert 
                            (deviceid, timeframe, from_datetime, to_datetime, Max_count, Min_count, PchCount, people_count_threshold_limit, isAlertrequired, isJsonCreated, isJSONposted, remarks)
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                            """,
                            (dev_id, timeframe_mins, start_time, breach_time, max_out, min_out, pch_count, threshold, True, False, False, remarks)
                        )
                    else:
                        # Outside cooldown, generate alert
                        remarks = "Alert Triggered"
                        
                        cursor.execute(
                            """
                            INSERT INTO tbl_pch_alert 
                            (deviceid, timeframe, from_datetime, to_datetime, Max_count, Min_count, PchCount, people_count_threshold_limit, isAlertrequired, isJsonCreated, isJSONposted, remarks)
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                            """,
                            (dev_id, timeframe_mins, start_time, end_time, max_out, min_out, pch_count, threshold, True, False, False, remarks)
                        )
                else:
                    # Log evaluation even if threshold is not met
                    remarks = "Threshold not breached"
                    cursor.execute(
                        """
                        INSERT INTO tbl_pch_alert 
                        (deviceid, timeframe, from_datetime, to_datetime, Max_count, Min_count, PchCount, people_count_threshold_limit, isAlertrequired, isJsonCreated, isJSONposted, remarks)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        """,
                        (dev_id, timeframe_mins, start_time, end_time, max_out, min_out, pch_count, threshold, False, False, False, remarks)
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
