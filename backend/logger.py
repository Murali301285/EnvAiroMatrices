import os
from datetime import datetime

base_dir = os.path.dirname(os.path.abspath(__file__))

ERROR_LOG_DIR = os.path.join(base_dir, "ErrorLogs")
EVENT_LOG_DIR = os.path.join(base_dir, "EventLogs")
JSON_LOG_DIR = os.path.join(base_dir, "JSONLogs")

if not os.path.exists(ERROR_LOG_DIR):
    os.makedirs(ERROR_LOG_DIR)
if not os.path.exists(EVENT_LOG_DIR):
    os.makedirs(EVENT_LOG_DIR)
if not os.path.exists(JSON_LOG_DIR):
    os.makedirs(JSON_LOG_DIR)

def log_error(source: str, error_message: str):
    """
    Logs an error in the format:
    Error: <source>
    DateTime: <YYYY-MM-DD HH:MM:SS>
    Error: <error_message>
    ==============
    """
    now = datetime.now()
    dt_str = now.strftime("%Y-%m-%d %H:%M:%S")
    date_str = now.strftime("%d%m%Y")
    
    err_file_path = os.path.join(ERROR_LOG_DIR, f"{date_str}_errors.txt")
    log_entry = f"Error: {source}\nDateTime: {dt_str}\nError: {error_message}\n==============\n"
    
    try:
        with open(err_file_path, "a", encoding="utf-8") as f:
            f.write(log_entry)
    except Exception as e:
        print(f"Failed to write to error log: {e}")

def log_event(message: str):
    """
    Logs an event in a daily rotational file: EventLogs/DDMMYYYY_events.txt
    """
    now = datetime.now()
    date_str = now.strftime("%d%m%Y")
    event_file_name = f"{date_str}_events.txt"
    event_file_path = os.path.join(EVENT_LOG_DIR, event_file_name)
    
    log_entry = f"[{now.strftime('%H:%M:%S')}] {message}\n"
    
    try:
        with open(event_file_path, "a", encoding="utf-8") as f:
            f.write(log_entry)
    except Exception as e:
        print(f"Failed to write event log: {e}")
