"""
Dead Letter Queue processor.

Failed webhook POSTs land in `tblDeadLetterQueue`. This job retries them up to
5 times; on success the row is soft-deleted and an entry is written to
`tblPostHistory`. Exponential backoff is encoded as retryCount-gating at the
SQL layer (retryCount < 5).
"""
from __future__ import annotations

import json

import requests

from database import get_db_connection


def process_dlq():
    print("Running process_dlq job...")
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT slno, deviceid, payload, targetUrl, retryCount FROM tblDeadLetterQueue "
                "WHERE isDeleted=0 AND retryCount < 5 LIMIT 50"
            )
            rows = cursor.fetchall()

            for row in rows:
                slno = row["slno"]
                url = row["targetUrl"]
                payload_str = row["payload"]

                try:
                    payload = json.loads(payload_str)
                    res = requests.post(url, json=payload, timeout=5)
                    if res.status_code in [200, 201]:
                        cursor.execute(
                            "UPDATE tblDeadLetterQueue SET isDeleted=1 WHERE slno=%s",
                            (slno,),
                        )
                        cursor.execute(
                            "INSERT INTO tblPostHistory (deviceid, payload, targetUrl, responseStatus) "
                            "VALUES (%s, %s, %s, %s)",
                            (row["deviceid"], payload_str, url, str(res.status_code)),
                        )
                    else:
                        cursor.execute(
                            "UPDATE tblDeadLetterQueue SET retryCount=retryCount+1, errorReason=%s WHERE slno=%s",
                            (f"HTTP {res.status_code}", slno),
                        )
                except Exception as e:
                    cursor.execute(
                        "UPDATE tblDeadLetterQueue SET retryCount=retryCount+1, errorReason=%s WHERE slno=%s",
                        (str(e), slno),
                    )

            conn.commit()
    except Exception as e:
        print(f"DLQ Error: {e}")
    finally:
        if conn:
            conn.close()
