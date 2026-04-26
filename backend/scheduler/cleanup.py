"""
Maintenance jobs.

- db_cleanup_job: purge tblDatareceiver rows older than DB_RETENTION_DAYS
- disk_cleanup_job: delete log files older than LOG_RETENTION_DAYS

Both retention windows come from `.env` (see config.py).
"""
from __future__ import annotations

import os
import time

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import get_db_connection

# Fallback/Hardcoded config to avoid import errors on Windows PM2 environments
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_RETENTION_DAYS = 2
LOG_RETENTION_DAYS = 2


def db_cleanup_job():
    print(f"Running db_cleanup_job (retention={DB_RETENTION_DAYS}d)...")
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                f"DELETE FROM tblDatareceiver WHERE receivedOn < NOW() - INTERVAL '{DB_RETENTION_DAYS} days'"
            )
            conn.commit()
    except Exception as e:
        print(f"Cleanup Error: {e}")
    finally:
        if conn:
            conn.close()


def disk_cleanup_job():
    print(
        f"Running disk_cleanup_job for files older than {LOG_RETENTION_DAYS} days..."
    )
    directories_to_clean = [
        os.path.join(BACKEND_DIR, "ErrorLogs"),
        os.path.join(BACKEND_DIR, "EventLogs"),
        os.path.join(BACKEND_DIR, "JSONLogs"),
    ]

    current_time = time.time()
    cutoff_time = current_time - (LOG_RETENTION_DAYS * 86400)

    for dir_path in directories_to_clean:
        if not os.path.exists(dir_path):
            continue

        for root, _dirs, files in os.walk(dir_path):
            for filename in files:
                file_path = os.path.join(root, filename)
                if os.path.isfile(file_path):
                    file_mtime = os.path.getmtime(file_path)
                    if file_mtime < cutoff_time:
                        try:
                            os.remove(file_path)
                            print(f"Deleted old log file: {file_path}")
                        except Exception as e:
                            print(f"Failed to delete {file_path}: {e}")
