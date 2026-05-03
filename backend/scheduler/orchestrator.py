"""
JSON Orchestrator — fires at :14/:29/:44/:59, processes the IoT receive queue
and emits scheduled payloads using the O-Engine template parser.

Advisory lock key 8381 is held per-run so multiple workers won't double-fire.
The lock is always released in the `finally` block (previously the early-return
path relied on the connection close to drop it, which is fragile).
"""
from __future__ import annotations

import datetime
import os

from database import get_db_connection
from .common import _parse_template, _dispatch_webhook, _get_alias

ADVISORY_LOCK_KEY = 8381


def orchestrate_json_payloads():
    """Evaluate #Tags and $Tags logic for the current 15-minute bucket."""
    conn = get_db_connection()
    lock_acquired = False
    try:
        with conn.cursor() as cursor:
            # ACQUIRE ADVISORY LOCK — prevents parallel runs across workers
            cursor.execute("SELECT pg_try_advisory_lock(%s)", (ADVISORY_LOCK_KEY,))
            lock_acquired = bool(cursor.fetchone()[0])
            if not lock_acquired:
                return  # Another worker is already handling this cycle

            cursor.execute(
                "SELECT slno, deviceid, revText, receivedOn FROM tblDatareceiver "
                "WHERE isProcessed=0 ORDER BY slno ASC LIMIT 5000"
            )
            unprocessed = cursor.fetchall()

            if not unprocessed:
                return

            orchestrated_buckets = set()
            processed_slnos = []

            for row in unprocessed:
                slno = row["slno"]
                dev_id = row["deviceid"]
                rec_on = row.get("receivedon") or row.get("receivedOn")
                processed_slnos.append(slno)

                if not rec_on:
                    continue

                bucket_minute = (rec_on.minute // 15) * 15
                bucket_key = (dev_id, rec_on.date(), rec_on.hour, bucket_minute)

                # Already transmitted for this bucket in this cycle — drain silently
                if bucket_key in orchestrated_buckets:
                    continue

                cursor.execute(
                    """
                    SELECT f.jsonTemplate, f.storedProcedureName, m.folder_name,
                           dm.create_json_file, s.is_active, s.slno as schedule_id,
                           f.type as payload_type
                    FROM tblDeviceMaster dm
                    JOIN tblDeviceJsonMapping m ON dm.customer_code = m.customer_code
                    JOIN tblJsonFormatter f ON m.scheduledJsonId = f.slno
                    LEFT JOIN tblScheduler s ON dm.customer_code = s.customer_code AND s.isDeleted=0
                    WHERE dm.deviceid=%s AND f.isDeleted=0
                    """,
                    (dev_id,),
                )
                formatter = cursor.fetchone()

                if formatter and (
                    formatter.get("jsontemplate") or formatter.get("jsonTemplate")
                ):
                    is_active = formatter.get("is_active")
                    if is_active is False:
                        continue  # schedule paused — drain queue

                    template = formatter.get("jsontemplate") or formatter.get("jsonTemplate")
                    sp_name = (
                        formatter.get("storedprocedurename")
                        or formatter.get("storedProcedureName")
                    )
                    folder_name = formatter.get("folder_name") or ""
                    create_json_file = formatter.get("create_json_file")

                    if sp_name:
                        result_payload = _parse_template(
                            template, sp_name, dev_id, None, rec_on
                        )

                        import json
                        try:
                            payload_dict = json.loads(result_payload)
                            ist_dt = payload_dict.get("ist_datetime")
                            if ist_dt:
                                cursor.execute(
                                    """
                                    SELECT slno FROM tblScheduledJsonHistory
                                    WHERE deviceid=%s AND payload_type='Scheduled'
                                      AND json_payload->>'ist_datetime' = %s
                                    """,
                                    (dev_id, ist_dt)
                                )
                                if cursor.fetchone():
                                    continue  # already sent for this bucket
                        except Exception as parse_err:
                            print(f"JSON Parse Error for dedup: {parse_err}")

                        # Optional local file sink
                        if create_json_file and folder_name and folder_name.strip():
                            try:
                                base_dir = os.path.dirname(
                                    os.path.dirname(os.path.abspath(__file__))
                                )
                                clean_folder = (
                                    folder_name.strip().replace("\\", "/").lstrip("/")
                                )
                                target_dir = os.path.join(base_dir, clean_folder)
                                os.makedirs(target_dir, exist_ok=True)

                                safe_dt = datetime.datetime.now().strftime(
                                    "%d_%m_%Y_%H_%M"
                                )
                                f_name_id = _get_alias(dev_id, cursor)
                                f_path = os.path.join(
                                    target_dir,
                                    f"{f_name_id.replace('+', '').replace(':', '')}_{safe_dt}_sch.json",
                                )
                                with open(f_path, "w") as fh:
                                    fh.write(result_payload)
                            except Exception as file_err:
                                print(f"Local Store ERROR: {file_err}")

                        payload_type = formatter.get("payload_type") or "Scheduled"
                        try:
                            cursor.execute("SAVEPOINT insert_sp")
                            cursor.execute(
                                "INSERT INTO tblScheduledJsonHistory (deviceid, json_payload, payload_type) "
                                "VALUES (%s, %s::jsonb, %s)",
                                (dev_id, result_payload, payload_type),
                            )
                            cursor.execute("RELEASE SAVEPOINT insert_sp")
                        except Exception as insert_err:
                            cursor.execute("ROLLBACK TO SAVEPOINT insert_sp")
                            print(f"History Insert Error (Likely Duplicate): {insert_err}")
                            continue

                        _dispatch_webhook(dev_id, result_payload, cursor, payload_type)

                        schedule_id = formatter.get("schedule_id")
                        if schedule_id:
                            cursor.execute(
                                "UPDATE tblScheduler SET last_run = NOW() WHERE slno=%s",
                                (schedule_id,),
                            )

                orchestrated_buckets.add(bucket_key)

            if processed_slnos:
                cursor.execute(
                    "UPDATE tblDatareceiver SET isProcessed=1, processedOn=NOW() WHERE slno = ANY(%s)",
                    (processed_slnos,),
                )
            conn.commit()
    except Exception as e:
        print(f"Orchestration Error: {e}")
    finally:
        # Always release the advisory lock, on every path
        try:
            if lock_acquired and conn and not conn.closed:
                with conn.cursor() as release_cur:
                    release_cur.execute(
                        "SELECT pg_advisory_unlock(%s)", (ADVISORY_LOCK_KEY,)
                    )
                conn.commit()
        except Exception as unlock_err:
            print(f"Advisory unlock warning: {unlock_err}")
        if conn:
            conn.close()
