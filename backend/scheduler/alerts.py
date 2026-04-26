"""
Generic alert dispatcher running at the :14/:29/:44/:59 anchors.

Unlike the TVOC/PCH stream evaluators which work off raw bucket tables, this
engine reads the customer-configured alert stored procedure and tracks
per-parameter sequence state in `tblAlertMonitor`. It emits both breach and
resolution payloads via the shared `_dispatch_webhook`.
"""
from __future__ import annotations

import datetime
import json

from database import get_db_connection
from .common import _parse_template, _dispatch_webhook


def evaluate_active_alerts():
    """Walk every alert-enabled device, compare SP output vs. monitor state,
    and dispatch Alert / Resolved payloads where required."""
    print("Running evaluate_active_alerts...")
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT dm.deviceid, s.alert_freq, s.param_alert_freq,
                       s.post_url_live, s.post_url_staging,
                       f.jsonTemplate, f.storedProcedureName
                FROM tblDeviceMaster dm
                JOIN tblScheduler s ON dm.customer_code = s.customer_code
                JOIN tblDeviceJsonMapping m ON dm.customer_code = m.customer_code
                JOIN tblJsonFormatter f ON m.scheduledJsonId = f.slno
                WHERE s.alert_req = true AND f.isDeleted = 0
                  AND dm.isDeleted = 0 AND dm.active = 1
                """
            )
            devices = cursor.fetchall()

            for dev in devices:
                dev_id = dev["deviceid"]
                base_alert_freq = dev["alert_freq"] or 5
                sp_name = dev["storedprocedurename"] or dev["storedprocedureName"]
                template = dev["jsontemplate"] or dev["jsonTemplate"]
                target_url = dev["post_url_live"] or "https://api.external.com/submit"
                if not sp_name:
                    continue

                param_freqs = dev.get("param_alert_freq") or {}
                if isinstance(param_freqs, str):
                    try:
                        param_freqs = json.loads(param_freqs)
                    except Exception:
                        param_freqs = {}
                def_freqs = {
                    "TVOC": base_alert_freq,
                    "PCH": base_alert_freq,
                    "PCD": base_alert_freq,
                }

                cursor.execute(f"SELECT * FROM {sp_name}(%s)", (dev_id,))
                current_state = cursor.fetchone()
                if not current_state:
                    continue

                active_bads = []
                if (
                    current_state.get("tvoc_bad") is not None
                    and float(current_state.get("tvoc_bad")) > 0
                ):
                    active_bads.append("TVOC")
                if (
                    current_state.get("pcd_bad") is not None
                    and float(current_state.get("pcd_bad")) > 0
                ):
                    active_bads.append("PCD")
                if (
                    current_state.get("pch_bad") is not None
                    and float(current_state.get("pch_bad")) > 0
                ):
                    active_bads.append("PCH")

                cursor.execute(
                    "SELECT * FROM tblAlertMonitor WHERE deviceid=%s AND is_resolved=FALSE",
                    (dev_id,),
                )
                monitors = cursor.fetchall()
                monitor_map = {m["param_tag"]: m for m in monitors}

                now = datetime.datetime.now()
                needs_dispatch = False
                dispatch_type = None
                newly_resolved_count = 0
                out_sequences = {"TVOC": 0, "PCH": 0, "PCD": 0}

                for p in ["TVOC", "PCH", "PCD"]:
                    freq = param_freqs.get(p, def_freqs.get(p, 15))
                    mon = monitor_map.get(p)
                    is_bad = p in active_bads

                    if is_bad:
                        if not mon:
                            # 1st strike: begin monitoring, don't dispatch yet
                            cursor.execute(
                                """
                                INSERT INTO tblAlertMonitor
                                    (deviceid, param_tag, sequence_count, last_checked_on, created_on, is_resolved)
                                VALUES (%s, %s, 0, %s, %s, FALSE)
                                """,
                                (dev_id, p, now, now),
                            )
                            out_sequences[p] = 0
                        else:
                            last_check = mon.get("last_checked_on")
                            mins_elapsed = (
                                (now - last_check).total_seconds() / 60.0
                                if last_check
                                else 99999
                            )
                            seq = mon.get("sequence_count") or 0

                            if mins_elapsed >= freq:
                                seq += 1
                                slno = mon.get("slno")
                                cursor.execute(
                                    "UPDATE tblAlertMonitor SET sequence_count=%s, last_checked_on=%s WHERE slno=%s",
                                    (seq, now, slno),
                                )
                                needs_dispatch = True
                                dispatch_type = "threshold_breach"

                            out_sequences[p] = seq
                    else:
                        if mon:
                            slno = mon.get("slno")
                            cursor.execute(
                                "UPDATE tblAlertMonitor SET is_resolved=TRUE, resolved_on=%s WHERE slno=%s",
                                (now, slno),
                            )
                            newly_resolved_count += 1
                            out_sequences[p] = 0

                # Only emit a global "resolved" when every param is Good AND
                # something just flipped from Bad to Good this cycle.
                if newly_resolved_count > 0 and len(active_bads) == 0:
                    needs_dispatch = True
                    dispatch_type = "threshold_resolved"

                if needs_dispatch:
                    overrides = {
                        "triggered_by": dispatch_type,
                        "tvoc_consecutive_bad": out_sequences["TVOC"],
                        "pch_consecutive_bad": out_sequences["PCH"],
                        "pcd_consecutive_bad": out_sequences["PCD"],
                    }
                    overrides["alert_sequence"] = max(
                        list(out_sequences.values()) + [0]
                    )

                    payload = _parse_template(template, sp_name, dev_id, overrides)
                    _dispatch_webhook(dev_id, payload, cursor, "Alert")

            conn.commit()
    except Exception as e:
        print(f"Alert Dispatch Engine Error: {e}")
    finally:
        if conn:
            conn.close()
