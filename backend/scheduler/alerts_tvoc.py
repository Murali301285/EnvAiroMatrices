"""
TVOC alert engine.

- evaluate_tvoc_bucket_stream: 1-minute sweep that opens a bucket when
  `VOC + SH2S > 12 ppm` AND `IAQ >= 250` (per spec).
- dispatch_tvoc_alerts_job: walks active buckets on 5-minute checkpoints and
  either extends the Bad state (threshold_breach) or emits a threshold_resolved
  payload when the window is clean.
"""
from __future__ import annotations

import datetime
import os
import re

from database import get_db_connection
from .common import _parse_template, _dispatch_webhook, _get_alias


def evaluate_tvoc_bucket_stream():
    """Pick up fresh IoT bursts and (re)open a TVOC alert bucket if thresholds are breached."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT slno, deviceid, revText, receivedOn FROM tblDatareceiver "
                "WHERE isAlertProcessed=0 LIMIT 2000"
            )
            unprocessed = cursor.fetchall()

            if not unprocessed:
                return

            processed_slnos = []

            for row in unprocessed:
                processed_slnos.append(row["slno"])
                _dev_id = row["deviceid"]
                _rev_text = row.get("revtext") or row.get("revText", "")
                _received_on = row.get("receivedon") or row.get("receivedOn")

                try:
                    voc_match = re.search(r"VOC:([-0-9.]+)", _rev_text)
                    sh2s_match = re.search(r"SH2S:([-0-9.]+)", _rev_text)
                    iaq_match = re.search(r"IAQ:([-0-9.]+)", _rev_text)

                    if voc_match and sh2s_match:
                        raw_sum = float(voc_match.group(1)) + float(sh2s_match.group(1))
                        sum_val = min(15.00, round(raw_sum, 2))

                        iaq_val = float(iaq_match.group(1)) if iaq_match else 0.0
                        now = datetime.datetime.now()

                        cursor.execute(
                            "SELECT * FROM tblAlertBucketTVOC WHERE DeviceId=%s AND isResolved=0 ORDER BY slno DESC LIMIT 1",
                            (_dev_id,),
                        )
                        open_bucket = cursor.fetchone()

                        if sum_val > 12.00 and iaq_val >= 250:
                            if not open_bucket:
                                cursor.execute(
                                    """
                                    INSERT INTO tblAlertBucketTVOC
                                        (DeviceId, CDatetime, tvoc_value, count, isResolved,
                                         continousbad, lastupdatedon, currentstatus)
                                    VALUES (%s, %s, %s, 0, 0, 0, %s, 'Bad')
                                    """,
                                    (_dev_id, _received_on, sum_val, now),
                                )
                            else:
                                b_slno = open_bucket["slno"]
                                c_datetime = open_bucket.get("cdatetime")
                                diff_mins = (
                                    int((now - c_datetime).total_seconds() / 60.0)
                                    if c_datetime
                                    else 0
                                )
                                cursor.execute(
                                    "UPDATE tblAlertBucketTVOC SET tvoc_value=%s, continousbad=%s, lastupdatedon=%s WHERE slno=%s",
                                    (sum_val, diff_mins, now, b_slno),
                                )
                        # If sum_val <= 12 or IAQ < 250 we do nothing here —
                        # the 5-minute watchdog (dispatch_tvoc_alerts_job) handles resolution.
                except Exception as ex:
                    print("Bucket Parser Error:", ex)

            if processed_slnos:
                placeholders = ",".join(["%s"] * len(processed_slnos))
                cursor.execute(
                    f"UPDATE tblDatareceiver SET isAlertProcessed=1 WHERE slno IN ({placeholders})",
                    tuple(processed_slnos),
                )
            conn.commit()
    except Exception as e:
        print("TVOC Bucket Stream Error:", e)
    finally:
        if conn:
            conn.close()


def dispatch_tvoc_alerts_job():
    """Check active TVOC buckets on 5-minute cadence; emit breach or resolved payloads."""
    print("Running TVOC Alert Dispatcher...")
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT f.jsonTemplate, f.storedProcedureName FROM tblJsonFormatter f "
                "WHERE f.name='woloo_scheduled_json' AND f.isDeleted=0 LIMIT 1"
            )
            formatter = cursor.fetchone()

            if not formatter or not formatter.get("jsontemplate"):
                return

            template = formatter.get("jsontemplate") or formatter.get("jsonTemplate")
            sp_name = (
                formatter.get("storedprocedurename") or formatter.get("storedProcedureName")
            )

            cursor.execute("SELECT * FROM tblAlertBucketTVOC WHERE isResolved=0")
            active_alerts = cursor.fetchall()
            now = datetime.datetime.now()

            for b in active_alerts:
                dev_id = b.get("deviceid")
                b_slno = b.get("slno")
                c_datetime = b.get("cdatetime") or now
                sequence_count = b.get("count", 0)

                target_check_time = c_datetime + datetime.timedelta(
                    minutes=5 * (sequence_count + 1)
                )

                if now < target_check_time:
                    continue  # next 5-minute checkpoint not reached

                eval_start_time = target_check_time - datetime.timedelta(minutes=5)

                cursor.execute(
                    "SELECT revText FROM tblDatareceiverHistory "
                    "WHERE deviceid=%s AND receivedOn > %s AND receivedOn <= %s",
                    (dev_id, eval_start_time, target_check_time),
                )
                block_rows = cursor.fetchall()

                is_still_bad = False
                highest_tvoc_in_block = float(b.get("tvoc_value", 0) or 0)
                last_tvoc_in_block = 0

                for br in block_rows:
                    voc_match = re.search(r"VOC:([-0-9.]+)", br["revtext"])
                    sh2s_match = re.search(r"SH2S:([-0-9.]+)", br["revtext"])
                    if voc_match and sh2s_match:
                        sum_val = min(
                            15.00,
                            round(
                                float(voc_match.group(1)) + float(sh2s_match.group(1)), 2
                            ),
                        )
                        last_tvoc_in_block = sum_val
                        if sum_val > highest_tvoc_in_block:
                            highest_tvoc_in_block = sum_val
                        if sum_val > 12.00:
                            is_still_bad = True

                diff_mins = int((now - c_datetime).total_seconds() / 60.0)

                if is_still_bad or not block_rows:
                    # Still bad (or no telemetry received — err toward Bad)
                    cursor.execute(
                        "SELECT s.post_url_live FROM tblDeviceMaster dm "
                        "JOIN tblScheduler s ON dm.customer_code = s.customer_code "
                        "WHERE dm.deviceid=%s LIMIT 1",
                        (dev_id,),
                    )
                    s_row = cursor.fetchone()
                    target_url = s_row["post_url_live"] if s_row else ""

                    # Enforce the 15-ppm cap on the "value" shown to the webhook too
                    capped_value = min(15.0, round(float(highest_tvoc_in_block), 2))
                    overrides = {
                        "triggered_by": "threshold_breach",
                        "alert_sequence": sequence_count + 1,
                        "tvoc_bad": diff_mins,
                        "parameters": "tvoc",
                        "tvoc": {
                            "value": capped_value,
                            "unit": "ppm",
                            "condition": "bad",
                        },
                    }
                    payload, diagnostics = _parse_template(template, sp_name, dev_id, overrides)
                    if target_url:
                        _dispatch_webhook(dev_id, payload, cursor, "Tvoc Alert", diagnostics)
                    cursor.execute(
                        "INSERT INTO tblScheduledJsonHistory (deviceid, json_payload, payload_type) VALUES (%s, %s::jsonb, %s)",
                        (dev_id, payload, "Alert"),
                    )
                    _write_alert_file(
                        payload, dev_id, cursor, subfolder="Alert", kind="Tvoc"
                    )

                    cursor.execute(
                        "UPDATE tblAlertBucketTVOC SET count = count + 1, lastupdatedon=%s, continousbad=%s, tvoc_value=%s WHERE slno=%s",
                        (now, diff_mins, highest_tvoc_in_block, b_slno),
                    )
                else:
                    # Resolution path
                    resolve_val = last_tvoc_in_block if last_tvoc_in_block > 0 else 0.00
                    cursor.execute(
                        "UPDATE tblAlertBucketTVOC SET isResolved=1, currentstatus='Good', statuschangedon=%s, lastupdatedon=%s, continousbad=%s, tvoc_value=%s WHERE slno=%s",
                        (now, now, diff_mins, resolve_val, b_slno),
                    )

            # Emit Resolved payloads for buckets that are resolved but never sent
            cursor.execute(
                "SELECT * FROM tblAlertBucketTVOC WHERE isResolved=1 AND ResolvedalertSentOn IS NULL"
            )
            resolved_alerts = cursor.fetchall()
            now = datetime.datetime.now()
            for b in resolved_alerts:
                dev_id = b.get("deviceid")
                b_slno = b.get("slno")
                cursor.execute(
                    "SELECT s.post_url_live FROM tblDeviceMaster dm "
                    "JOIN tblScheduler s ON dm.customer_code = s.customer_code "
                    "WHERE dm.deviceid=%s LIMIT 1",
                    (dev_id,),
                )
                s_row = cursor.fetchone()
                target_url = s_row["post_url_live"] if s_row else ""
                diff_mins = int(b.get("continousbad", 0) or 0)
                exact_tvoc_value = float(b.get("tvoc_value", 0) or 0)
                capped_value = min(15.0, round(float(exact_tvoc_value), 2))
                overrides = {
                    "triggered_by": "threshold_resolved",
                    "alert_sequence": max(1, b.get("count", 1)),
                    "tvoc_bad": diff_mins,
                    "parameters": "tvoc",
                    "tvoc": {
                        "value": capped_value,
                        "unit": "ppm",
                        "condition": "good",
                    },
                }
                payload, diagnostics = _parse_template(template, sp_name, dev_id, overrides)
                if target_url:
                    _dispatch_webhook(dev_id, payload, cursor, "TVOC Resolved", diagnostics)
                cursor.execute(
                    "INSERT INTO tblScheduledJsonHistory (deviceid, json_payload, payload_type) VALUES (%s, %s::jsonb, %s)",
                    (dev_id, payload, "Resolved"),
                )
                _write_alert_file(
                    payload,
                    dev_id,
                    cursor,
                    subfolder="Resolved",
                    kind="AlertResolved_Tvoc",
                )
                cursor.execute(
                    "UPDATE tblAlertBucketTVOC SET ResolvedalertSentOn=%s WHERE slno=%s",
                    (now, b_slno),
                )

            conn.commit()
    except Exception as e:
        print("Dispatch TVOC Error:", e)
    finally:
        if conn:
            conn.close()


def _write_alert_file(payload: str, dev_id: str, cursor, subfolder: str, kind: str) -> None:
    """Write the payload JSON to JSONLogs/Woloo/<subfolder>/ for audit."""
    try:
        from logger import JSON_LOG_DIR  # lazy — logger is an existing module

        safe_dt = datetime.datetime.now().strftime("%d_%m_%Y_%H_%M")
        target_dir = os.path.join(JSON_LOG_DIR, "Woloo", subfolder)
        os.makedirs(target_dir, exist_ok=True)
        f_name_id = _get_alias(dev_id, cursor)
        suffix = "Alert_Tvoc" if kind == "Tvoc" else kind
        f_path = os.path.join(
            target_dir,
            f"{f_name_id.replace(':', '').replace('+', '')}_{safe_dt}_{suffix}.json",
        )
        with open(f_path, "w", encoding="utf-8") as fh:
            fh.write(payload)
    except Exception as e:
        print("File Save Error:", e)
