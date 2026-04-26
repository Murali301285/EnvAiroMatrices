"""
Minute Aggregation Engine.

Consumes raw rows from `tblDatareceiver` (where `isAggregated=0`) and writes
per-minute metrics into `tblMinuteDetails`. Applies the Avg/Sum/Max/Min/First/
Last `valueFactor` rules and evaluates parameter status conditions per the
`tblParameterMaster.status_conditions` JSON.

Note: IN/OUT always use (max-min) delta inside the minute bucket; the raw MAX
is also stored under `{TAG}_RAW` so PCD (cumulative daily) math can diff it
against the first reading of the day later.
"""
from __future__ import annotations

import json
from collections import defaultdict

from database import get_db_connection


def aggregate_minute_data():
    """Summarize IoT data per device per minute."""
    print("Running Minute Data Aggregator...")
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            # Cap at fully elapsed minutes to avoid partial-minute rollups
            cursor.execute(
                "SELECT slno, deviceid, revtext, receivedon FROM tblDatareceiver "
                "WHERE isAggregated=0 AND receivedon < DATE_TRUNC('minute', NOW()) "
                "ORDER BY receivedon ASC LIMIT 500"
            )
            unaggregated = cursor.fetchall()

            if not unaggregated:
                return

            # grouped_data[dev_id][minute_block_datetime] = list of (slno, parsed_dict)
            grouped_data = defaultdict(lambda: defaultdict(list))

            for row in unaggregated:
                slno = row.get("slno")
                dev_id = row.get("deviceid")
                raw_text = row.get("revtext") or row.get("revText")
                rec_on = row.get("receivedon") or row.get("receivedOn")

                if not rec_on:
                    continue

                minute_block = rec_on.replace(second=0, microsecond=0)

                # Parse "DT:17:57:27,IN:1394,OUT:1352..."
                parsed = {}
                if raw_text:
                    for part in raw_text.split(","):
                        if ":" in part:
                            parts = part.split(":", 1)
                            if len(parts) == 2:
                                k = parts[0].strip().upper()
                                v = parts[1].strip()
                                try:
                                    parsed[k] = float(v)
                                except ValueError:
                                    parsed[k] = v

                grouped_data[dev_id][minute_block].append((slno, parsed))

            for dev_id, blocks in grouped_data.items():
                cursor.execute(
                    """
                    SELECT m.api_rev_tag, p.valueFactor, p.datatype, p.decimalplaces,
                           p.labelName, p.status_conditions
                    FROM tblDeviceParameterMapping m
                    JOIN tblParameterMaster p ON m.parameter_id = p.slno
                    WHERE m.deviceid = %s AND m.isDeleted = 0 AND p.status = 1
                    """,
                    (dev_id,),
                )
                mappings = cursor.fetchall()

                for minute_block, records in blocks.items():
                    minute_metrics = {}

                    if mappings:
                        for mapping in mappings:
                            tag_raw = mapping.get("api_rev_tag")
                            if not tag_raw:
                                continue

                            tag = tag_raw.upper()
                            v_factor = (
                                mapping.get("valuefactor")
                                or mapping.get("valueFactor")
                                or "Avg"
                            ).upper()

                            values = []
                            for r in records:
                                payload = r[1]
                                if tag in payload:
                                    values.append(payload[tag])

                            if not values:
                                continue

                            metric_val = None
                            numeric_vals = [
                                v for v in values if isinstance(v, (int, float))
                            ]

                            if tag in ["IN", "OUT"]:
                                if numeric_vals:
                                    current_max = max(numeric_vals)
                                    current_min = min(numeric_vals)
                                    metric_val = max(
                                        0, round(current_max - current_min, 2)
                                    )
                                    minute_metrics[f"{tag}_RAW"] = current_max
                                else:
                                    metric_val = 0
                            elif v_factor in ["AVG", "SUM"]:
                                if numeric_vals:
                                    if v_factor == "AVG":
                                        metric_val = round(
                                            sum(numeric_vals) / len(numeric_vals), 2
                                        )
                                    else:  # SUM = Daily Cumulative — stored as per-minute delta
                                        current_max = max(numeric_vals)
                                        current_min = min(numeric_vals)
                                        metric_val = max(
                                            0, round(current_max - current_min, 2)
                                        )
                                        minute_metrics[f"{tag}_RAW"] = current_max
                            elif v_factor == "MAX":
                                metric_val = (
                                    max(numeric_vals) if numeric_vals else max(values)
                                )
                            elif v_factor == "MIN":
                                metric_val = (
                                    min(numeric_vals) if numeric_vals else min(values)
                                )
                            elif v_factor == "FIRST":
                                metric_val = values[0]
                            elif v_factor == "LAST":
                                metric_val = values[-1]
                            else:  # default → Avg
                                if numeric_vals:
                                    metric_val = round(
                                        sum(numeric_vals) / len(numeric_vals), 2
                                    )
                                else:
                                    metric_val = values[-1]

                            if metric_val is not None:
                                data_type = mapping.get("datatype") or "Decimal"
                                dec_places = mapping.get("decimalplaces")
                                if dec_places is None:
                                    dec_places = 2

                                if data_type == "Number":
                                    try:
                                        metric_val = int(round(float(metric_val)))
                                    except ValueError:
                                        pass
                                elif data_type == "Decimal":
                                    try:
                                        metric_val = round(float(metric_val), dec_places)
                                    except ValueError:
                                        pass
                                elif data_type == "Text":
                                    metric_val = str(metric_val)

                                minute_metrics[tag_raw] = metric_val

                                # Evaluate parameter status bounds
                                conds_raw = mapping.get("status_conditions")
                                label_name = mapping.get("labelname")

                                if conds_raw and label_name:
                                    conds = []
                                    if isinstance(conds_raw, str):
                                        try:
                                            conds = json.loads(conds_raw)
                                        except Exception:
                                            pass
                                    else:
                                        conds = conds_raw

                                    status_met = None
                                    for c in conds:
                                        try:
                                            v1 = float(c.get("val1", 0))
                                            v2 = float(
                                                c.get("val2", 0)
                                                if c.get("val2") is not None
                                                else 0.0
                                            )
                                            op = c.get("operator")
                                            label = c.get("label")

                                            mv = float(metric_val)

                                            if op == "<" and mv < v1:
                                                status_met = label
                                            elif op == "<=" and mv <= v1:
                                                status_met = label
                                            elif op == "=" and mv == v1:
                                                status_met = label
                                            elif op == ">=" and mv >= v1:
                                                status_met = label
                                            elif op == ">" and mv > v1:
                                                status_met = label
                                            elif (
                                                op == "BETWEEN"
                                                and min(v1, v2) <= mv <= max(v1, v2)
                                            ):
                                                status_met = label

                                            if status_met:
                                                break
                                        except (ValueError, TypeError):
                                            pass

                                    if status_met:
                                        minute_metrics[f"{label_name} Status"] = status_met

                    if minute_metrics:
                        cursor.execute(
                            """
                            INSERT INTO tblMinuteDetails (deviceid, minute_date, minute_time, metrics)
                            VALUES (%s, %s, %s, %s)
                            ON CONFLICT (deviceid, minute_date, minute_time)
                            DO UPDATE SET metrics = EXCLUDED.metrics
                            """,
                            (
                                dev_id,
                                minute_block.date(),
                                minute_block.time(),
                                json.dumps(minute_metrics),
                            ),
                        )

                    slnos = [r[0] for r in records]
                    if slnos:
                        format_strings = ",".join(["%s"] * len(slnos))
                        cursor.execute(
                            f"UPDATE tblDatareceiver SET isAggregated=1, aggregatedOn=NOW() WHERE slno IN ({format_strings})",
                            tuple(slnos),
                        )

            conn.commit()
    except Exception as e:
        import traceback

        traceback.print_exc()
        print(f"Minute Aggregator Error: {e}")
    finally:
        if conn:
            conn.close()
