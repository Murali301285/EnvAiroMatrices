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

def _parse_template(template_str, sp_name, deviceid):
    try:
        data = json.loads(template_str)
        
        def traverse(obj):
            if isinstance(obj, dict):
                return {k: traverse(v) for k, v in obj.items()}
            elif isinstance(obj, list):
                return [traverse(elem) for elem in obj]
            elif isinstance(obj, str):
                if obj.startswith('#'):
                    return obj[1:]  # Return raw text without #
                elif obj.startswith('$'):
                    # Simulated stored procedure output mapping
                    tag_name = obj[1:]
                    return f"SIMULATED_{tag_name}"
                return obj
            return obj
            
        parsed_data = traverse(data)
        return json.dumps(parsed_data)
    except:
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
            cursor.execute("SELECT slno, deviceid, revText, receivedOn FROM tblDatareceiver WHERE isProcessed=0 LIMIT 50")
            unprocessed = cursor.fetchall()
            
            for row in unprocessed:
                slno = row['slno']
                dev_id = row['deviceid']
                raw_text = row['revText']
                
                # Fetch formatter for device
                cursor.execute("SELECT f.jsonTemplate, f.storedProcedureName FROM tblDeviceJsonMapping m JOIN tblJsonFormatter f ON m.scheduledJsonId = f.slno WHERE m.deviceid=%s", (dev_id,))
                formatter = cursor.fetchone()
                
                if formatter and formatter['jsonTemplate']:
                    template = formatter['jsonTemplate']
                    sp_name = formatter['storedProcedureName']
                    
                    # Simulated parsing #Tags (static text overrides) and $Tags (SP results)
                    # For ex-> "name" :'#Project', "Tag":"$NH3"
                    result_payload = _parse_template(template, sp_name, dev_id)
                    
                    # Push to Staging URL (Simulated target mapped config)
                    cursor.execute("INSERT INTO tblDeadLetterQueue (deviceid, payload, targetUrl) VALUES (%s, %s, %s)", 
                                  (dev_id, result_payload, "https://api.external.com/submit"))
                                  
                # Mark as processed
                cursor.execute("UPDATE tblDatareceiver SET isProcessed=1, processedOn=NOW() WHERE slno=%s", (slno,))
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

def start_schedulers():
    scheduler = BackgroundScheduler()
    scheduler.add_job(orchestrate_json_payloads, 'interval', minutes=1)
    scheduler.add_job(process_dlq, 'interval', minutes=2)
    scheduler.add_job(db_cleanup_job, 'cron', hour=0, minute=0)
    scheduler.add_job(disk_cleanup_job, 'cron', hour=0, minute=5) # Runs slightly after DB cleanup
    scheduler.start()
    return scheduler
