"""
PCH alert engine.

- evaluate_pch_bucket_stream: 1-minute sweep computing OUT delta over the
  current 30-minute block; opens a PCH bucket when delta exceeds the
  customer's people-limit threshold.
- dispatch_pch_alerts_job: 15-minute cadence checkpoint for active PCH
  buckets; emits breach, resolved, or auto-resolved payloads.
"""
from __future__ import annotations

import datetime
import os
import re

from database import get_db_connection
from .common import _parse_template, _dispatch_webhook, _get_alias


def evaluate_pch_bucket_stream():
    """Pick up fresh IoT bursts and open a PCH bucket when the 30-min OUT delta exceeds the threshold."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT slno, deviceid, revText, receivedOn FROM tblDatareceiver "
                "WHERE isAlertProcessedPch=0 LIMIT 2000"
            )
            unprocessed = cursor.fetchall()

            if not unprocessed:
                return

            processed_slnos = []

            for row in unprocessed:
                processed_slnos.append(row["slno"])
                _dev_id = row["deviceid"]
                _rev_text = row.get("revtext") or row.get("revText", "")

                try:
                    out_match = re.search(r"OUT:([-0-9.]+)", _rev_text)
                    if out_match:
                        cursor.execute(
                            "SELECT c.peoplelimit FROM tblDeviceMaster d "
                            "LEFT JOIN tblCustomerMaster c ON d.customer_code = c.customer_code "
                            "WHERE d.deviceid=%s LIMIT 1",
                            (_dev_id,),
                        )
                        th_row = cursor.fetchone()
                        threshold = (
                            float(th_row["peoplelimit"])
                            if th_row and th_row["peoplelimit"] is not None
                            else 10.0
                        )

                        now = datetime.datetime.now()
                        block_start_minute = (now.minute // 30) * 30
                        block_start = now.replace(
                            minute=block_start_minute, second=0, microsecond=0
                        )

                        cursor.execute(
                            "SELECT revText FROM tblDatareceiverHistory "
                            "WHERE deviceid=%s AND receivedOn >= %s AND receivedOn <= %s",
                            (_dev_id, block_start, now),
                        )
                        block_rows = cursor.fetchall()

                        outs = []
                        ins = []
                        for br in block_rows:
                            m_out = re.search(r"OUT:([-0-9.]+)", br["revtext"])
                            if m_out:
                                outs.append(float(m_out.group(1)))
                            m_in = re.search(r"IN:([-0-9.]+)", br["revtext"])
                            if m_in:
                                ins.append(float(m_in.group(1)))

                        in_delta = max(0, round(max(ins) - min(ins), 2)) if ins else 0
                        if outs:
                            delta = max(outs) - min(outs)
                            if delta > threshold:
                                cursor.execute(
                                    "SELECT slno FROM tblalertbucketpch "
                                    "WHERE deviceid=%s AND isresolved=0 LIMIT 1",
                                    (_dev_id,),
                                )
                                open_bucket = cursor.fetchone()

                                if not open_bucket:
                                    cursor.execute(
                                        """
                                        INSERT INTO tblalertbucketpch
                                            (deviceid, CDatetime, people_count_delta, count, currentstatus, continousbad)
                                        VALUES (%s, %s, %s, 1, 'Bad', 0) RETURNING slno
                                        """,
                                        (_dev_id, now, delta),
                                    )
                                    _b_slno = cursor.fetchone()["slno"]

                                    cursor.execute(
                                        "SELECT jsontemplate, storedprocedurename FROM tbljsonformatter "
                                        "WHERE name='woloo_scheduled_json' AND isdeleted=0 LIMIT 1"
                                    )
                                    formatter = cursor.fetchone()
                                    if formatter:
                                        template = formatter.get("jsontemplate")
                                        sp_name = formatter.get("storedprocedurename")
                                        cursor.execute(
                                            "SELECT s.post_url_live FROM tblDeviceMaster dm "
                                            "JOIN tblScheduler s ON dm.customer_code = s.customer_code "
                                            "WHERE dm.deviceid=%s LIMIT 1",
                                            (_dev_id,),
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
                                                "value": delta,
                                                "unit": "",
                                                "pch_in": in_delta,
                                                "condition": "bad",
                                            },
                                        }
                                        payload = _parse_template(
                                            template, sp_name, _dev_id, overrides
                                        )
                                        if target_url:
                                            _dispatch_webhook(
                                                _dev_id, payload, cursor, "PCH Alert"
                                            )
                                        cursor.execute(
                                            "INSERT INTO tblScheduledJsonHistory (deviceid, json_payload, payload_type) VALUES (%s, %s::jsonb, %s)",
                                            (_dev_id, payload, "Alert"),
                                        )
                                        _write_alert_file(
                                            payload,
                                            _dev_id,
                                            cursor,
                                            subfolder="Alert",
                                            suffix="Alert_Pch",
                                        )
                                else:
                                    b_slno = open_bucket["slno"]
                                    cursor.execute(
                                        "UPDATE tblalertbucketpch SET people_count_delta=%s, lastupdatedon=%s WHERE slno=%s",
                                        (delta, now, b_slno),
                                    )
                except Exception as ex:
                    print("PCH Bucket Parser Error:", ex)

            if processed_slnos:
                placeholders = ",".join(["%s"] * len(processed_slnos))
                cursor.execute(
                    f"UPDATE tblDatareceiver SET isAlertProcessedPch=1 WHERE slno IN ({placeholders})",
                    tuple(processed_slnos),
                )
            conn.commit()
    except Exception as e:
        print("PCH Bucket Stream Error:", e)
    finally:
        if conn:
            conn.close()


def dispatch_pch_alerts_job():
    """15-minute cadence PCH checkpoint; emits breach / resolved payloads."""
    print("Running PCH Alert Dispatcher (15 Min Sequence Lock)...")
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT peoplelimit FROM tblcustomermaster WHERE customername ILIKE '%woloo%' LIMIT 1"
            )
            th_row = cursor.fetchone()
            threshold = (
                float(th_row["peoplelimit"])
                if th_row and th_row["peoplelimit"] is not None
                else 10.0
            )

            cursor.execute(
                "SELECT jsontemplate, storedprocedurename FROM tbljsonformatter "
                "WHERE name='woloo_scheduled_json' AND isdeleted=0 LIMIT 1"
            )
            formatter = cursor.fetchone()
            if not formatter:
                return

            cursor.execute("SELECT * FROM tblalertbucketpch WHERE isresolved=0")
            active_alerts = cursor.fetchall()
            now = datetime.datetime.now()

            for b in active_alerts:
                dev_id = b.get("deviceid")
                b_slno = b.get("slno")
                c_datetime = b.get("cdatetime") or now
                sequence_count = b.get("count", 0)

                target_check_time = c_datetime + datetime.timedelta(
                    minutes=15 * sequence_count
                )

                if now < target_check_time:
                    continue

                eval_start_time = target_check_time - datetime.timedelta(minutes=15)

                cursor.execute(
                    "SELECT revText FROM tblDatareceiverHistory "
                    "WHERE deviceid=%s AND receivedOn > %s AND receivedOn <= %s",
                    (dev_id, eval_start_time, target_check_time),
                )
                block_rows = cursor.fetchall()

                outs = []
                ins = []
                for br in block_rows:
                    m_out = re.search(r"OUT:([-0-9.]+)", br["revtext"])
                    if m_out:
                        outs.append(float(m_out.group(1)))
                    m_in = re.search(r"IN:([-0-9.]+)", br["revtext"])
                    if m_in:
                        ins.append(float(m_in.group(1)))

                template = formatter.get("jsontemplate") or formatter.get("jsonTemplate")
                sp_name = (
                    formatter.get("storedprocedurename")
                    or formatter.get("storedProcedureName")
                )

                cursor.execute(
                    "SELECT s.post_url_live FROM tblDeviceMaster dm "
                    "JOIN tblScheduler s ON dm.customer_code = s.customer_code "
                    "WHERE dm.deviceid=%s LIMIT 1",
                    (dev_id,),
                )
                s_row = cursor.fetchone()
                target_url = s_row["post_url_live"] if s_row else ""

                diff_mins = int((now - c_datetime).total_seconds() / 60.0) if c_datetime else 0

                # IN-delta for pch_in (mirrors OUT-delta pattern used for pch)
                in_delta = max(0, round(max(ins) - min(ins), 2)) if ins else 0

                if outs:
                    delta = max(outs) - min(outs)

                    if delta > threshold:
                        cursor.execute(
                            "UPDATE tblalertbucketpch SET count = count + 1, continousbad=%s, lastupdatedon=%s WHERE slno=%s",
                            (diff_mins, now, b_slno),
                        )
                        overrides = {
                            "triggered_by": "threshold_breach",
                            "alert_sequence": b["count"],
                            "pcd_bad": diff_mins,
                            "pch_bad": diff_mins,
                            "parameters": "pch",
                            "pch": {
                                "value": delta,
                                "unit": "",
                                "pch_in": in_delta,
                                "condition": "bad",
                            },
                        }
                        payload = _parse_template(template, sp_name, dev_id, overrides)
                        if target_url:
                            _dispatch_webhook(dev_id, payload, cursor, "PCH Alert")
                        cursor.execute(
                            "INSERT INTO tblScheduledJsonHistory (deviceid, json_payload, payload_type) VALUES (%s, %s::jsonb, %s)",
                            (dev_id, payload, "Alert"),
                        )
                        _write_alert_file(
                            payload, dev_id, cursor, subfolder="Alert", suffix="Alert_Pch"
                        )
                    else:
                        cursor.execute(
                            "UPDATE tblalertbucketpch SET isresolved=1, currentstatus='Good', statuschangedon=%s, continousbad=%s, people_count_delta=%s WHERE slno=%s",
                            (now, diff_mins, delta, b_slno),
                        )
                        cursor.execute(
                            "UPDATE tblalertbucketpch SET resolvedalertsenton=%s WHERE slno=%s",
                            (now, b_slno),
                        )
                        overrides = {
                            "triggered_by": "threshold_resolved",
                            "alert_sequence": max(1, b["count"]),
                            "pcd_bad": diff_mins,
                            "pch_bad": diff_mins,
                            "parameters": "pch",
                            "pch": {
                                "value": delta,
                                "unit": "",
                                "pch_in": in_delta,
                                "condition": "good",
                            },
                        }
                        payload = _parse_template(template, sp_name, dev_id, overrides)
                        if target_url:
                            _dispatch_webhook(dev_id, payload, cursor, "PCH Resolved")
                        cursor.execute(
                            "INSERT INTO tblScheduledJsonHistory (deviceid, json_payload, payload_type) VALUES (%s, %s::jsonb, %s)",
                            (dev_id, payload, "Resolved"),
                        )
                        _write_alert_file(
                            payload,
                            dev_id,
                            cursor,
                            subfolder="Resolved",
                            suffix="AlertResolved_Pch",
                        )
                else:
                    # No telemetry at all in the window — auto-resolve
                    cursor.execute(
                        "UPDATE tblalertbucketpch SET isresolved=1, currentstatus='Good', statuschangedon=%s, continousbad=%s, people_count_delta=0 WHERE slno=%s",
                        (now, diff_mins, b_slno),
                    )
                    cursor.execute(
                        "UPDATE tblalertbucketpch SET resolvedalertsenton=%s WHERE slno=%s",
                        (now, b_slno),
                    )

                    overrides = {
                        "triggered_by": "threshold_resolved",
                        "alert_sequence": max(1, b["count"]),
                        "pcd_bad": diff_mins,
                        "pch_bad": diff_mins,
                        "parameters": "pch",
                        "pch": {"value": 0, "unit": "", "pch_in": 0, "condition": "good"},
                    }
                    payload = _parse_template(template, sp_name, dev_id, overrides)
                    if target_url:
                        _dispatch_webhook(dev_id, payload, cursor, "PCH Resolved")
                    cursor.execute(
                        "INSERT INTO tblScheduledJsonHistory (deviceid, json_payload, payload_type) VALUES (%s, %s::jsonb, %s)",
                        (dev_id, payload, "Resolved"),
                    )
                    _write_alert_file(
                        payload,
                        dev_id,
                        cursor,
                        subfolder="",  # legacy flat-path case
                        suffix="AlertResolved_Pch",
                    )

            conn.commit()
    except Exception as e:
        print("Dispatch PCH Error:", e)
    finally:
        if conn:
            conn.close()


def _write_alert_file(payload: str, dev_id: str, cursor, subfolder: str, suffix: str) -> None:
    """Write the payload JSON to JSONLogs/Woloo/<subfolder>/ for audit."""
    try:
        from logger import JSON_LOG_DIR  # lazy — logger is an existing module

        safe_dt = datetime.datetime.now().strftime("%d_%m_%Y_%H_%M")
        if subfolder:
            target_dir = os.path.join(JSON_LOG_DIR, "Woloo", subfolder)
        else:
            target_dir = JSON_LOG_DIR
        os.makedirs(target_dir, exist_ok=True)
        f_name_id = _get_alias(dev_id, cursor)
        f_path = os.path.join(
            target_dir,
            f"{f_name_id.replace(':', '').replace('+', '')}_{safe_dt}_{suffix}.json",
        )
        with open(f_path, "w", encoding="utf-8") as fh:
            fh.write(payload)
    except Exception as e:
        print("File Save Error:", e)
