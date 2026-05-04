"""
Shared scheduler helpers used by orchestrator + alert dispatchers.

- _get_alias: device alias lookup
- _parse_template: O-Engine JSON template parser ($tags/#tags)
- _dispatch_webhook: Live/Staging POST with PostHistory logging
"""
from __future__ import annotations

import datetime
import decimal
import json
import re

import requests

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import get_db_connection

from config import WOLOO_API_KEY

# Hard cap for the TVOC family (VOC + SH2S derived). Spec: never emit > 15 ppm.
TVOC_MAX_PPM = 15.0
_TVOC_CAPPED_TAGS = {"tvoc_value", "tvoc_avg", "tvoc_max", "tvoc_min"}


def _get_alias(dev_id, cursor):
    cursor.execute(
        "SELECT alias FROM tblDeviceMaster WHERE deviceid=%s LIMIT 1", (dev_id,)
    )
    row = cursor.fetchone()
    return row["alias"] if row and row.get("alias") else dev_id


def _parse_template(template_str, sp_name, deviceid, overrides=None, ref_time=None):
    """
    O-Engine: evaluate `$tag` (SP column) and `#text` (literal) tokens inside a
    stored JSON template. Nested dicts returned by the SP are auto-flattened so
    sub-fields are reachable by `$sub_key`.
    """
    try:
        # 1. Fetch live mapping data natively from Stored Procedure logic bounds
        conn = get_db_connection()
        db_context = {}
        try:
            with conn.cursor() as cursor:
                # Pass ref_time if provided for accurate historical snapshots
                if ref_time:
                    cursor.execute(f"SELECT * FROM {sp_name}(%s, %s)", (deviceid, ref_time))
                else:
                    cursor.execute(f"SELECT * FROM {sp_name}(%s)", (deviceid,))
                result = cursor.fetchone()
                if result:
                    db_context = dict(result)

                    # Recursively flatten nested JSON dictionaries so sub-fields
                    # map dynamically — keeps $tag lookups simple.
                    for k, v in list(db_context.items()):
                        if isinstance(v, str):
                            try:
                                if v.strip().startswith("{") and v.strip().endswith("}"):
                                    v = json.loads(v)
                            except Exception:
                                pass

                        if isinstance(v, dict):
                            for sub_k, sub_v in v.items():
                                db_context[sub_k] = sub_v

                cursor.execute(
                    "SELECT alias FROM tblDeviceMaster WHERE deviceid=%s", (deviceid,)
                )
                alias_row = cursor.fetchone()
                if alias_row and alias_row.get("alias"):
                    alias_str = alias_row["alias"]
                    db_context["deviceid"] = alias_str
                    db_context["device_id"] = alias_str
                    db_context["deviceId"] = alias_str

                    # Force override explicitly in case schema has hardcoded MAC string
                    if overrides is None:
                        overrides = {}
                    overrides["device_id"] = alias_str
                    overrides["deviceid"] = alias_str
                    overrides["deviceId"] = alias_str

        except Exception as e:
            print(f"STORED_PROCEDURE Execution Error ({sp_name}): {e}")
        finally:
            if conn:
                conn.close()

        data = json.loads(template_str)
        current_overrides = overrides or {}

        def traverse(obj):
            if isinstance(obj, dict):
                mapped_dict = {}
                for k, v in obj.items():
                    if k in current_overrides:
                        override_val = current_overrides[k]
                        if override_val is None:
                            # Fallback defaults mirror the legacy behaviour
                            if k.lower() in ["temp", "temperature", "hum", "humidity"]:
                                override_val = 0
                            elif k.lower() in ["parameters", "triggeredby", "triggered_by"]:
                                override_val = "scheduled"
                            elif k.lower() in ["is_operational_hours", "isoperationhours", "hours"]:
                                override_val = False
                            else:
                                override_val = ""
                        mapped_dict[k] = override_val
                    else:
                        mapped_dict[k] = traverse(v)
                return mapped_dict
            elif isinstance(obj, list):
                return [traverse(elem) for elem in obj]
            elif isinstance(obj, str):
                if obj.startswith("#"):
                    return obj[1:]  # literal (strip '#')
                elif obj.startswith("$"):
                    tag_name = obj[1:]
                    tag_lower = tag_name.lower()
                    val = db_context.get(tag_name)
                    if val is None:
                        val = db_context.get(tag_lower)
                    if val is not None:
                        # Normalize Decimal -> int/float first
                        if isinstance(val, decimal.Decimal):
                            val = int(val) if val % 1 == 0 else float(val)
                        # Spec: TVOC family hard-capped at 15 ppm
                        if tag_lower in _TVOC_CAPPED_TAGS:
                            try:
                                numeric = float(val)
                                if numeric > TVOC_MAX_PPM:
                                    val = TVOC_MAX_PPM if not float(val).is_integer() else int(TVOC_MAX_PPM)
                            except (TypeError, ValueError):
                                pass
                        return val

                    # Fallback lookups for well-known sensor tags when the SP
                    # didn't return a value. Uses a fresh short-lived connection
                    # because the outer `conn` is already closed here.
                    fallback = ""
                    fb_conn = None
                    try:
                        if tag_lower in ["temp", "temperature"]:
                            # Last non-zero reading, newest first.
                            fb_conn = get_db_connection()
                            with fb_conn.cursor() as fc:
                                fc.execute(
                                    "SELECT temp_val FROM tblminutedetails "
                                    "WHERE deviceid=%s AND temp_val IS NOT NULL AND temp_val <> 0 "
                                    "ORDER BY created_at DESC LIMIT 1",
                                    (deviceid,),
                                )
                                fb_row = fc.fetchone()
                                fallback = (
                                    float(fb_row["temp_val"])
                                    if fb_row and fb_row["temp_val"] is not None
                                    else 0
                                )
                        elif tag_lower in ["temp_unit", "temperature_unit"]:
                            fb_conn = get_db_connection()
                            with fb_conn.cursor() as fc:
                                fc.execute(
                                    "SELECT unit FROM tblParameterMaster WHERE param_tag='TMP' LIMIT 1"
                                )
                                fb_row = fc.fetchone()
                                fallback = fb_row["unit"] if fb_row else ""
                        elif tag_lower in ["hum", "humidity"]:
                            # Last non-zero reading, newest first.
                            fb_conn = get_db_connection()
                            with fb_conn.cursor() as fc:
                                fc.execute(
                                    "SELECT hum_val FROM tblminutedetails "
                                    "WHERE deviceid=%s AND hum_val IS NOT NULL AND hum_val <> 0 "
                                    "ORDER BY created_at DESC LIMIT 1",
                                    (deviceid,),
                                )
                                fb_row = fc.fetchone()
                                fallback = (
                                    float(fb_row["hum_val"])
                                    if fb_row and fb_row["hum_val"] is not None
                                    else 0
                                )
                        elif tag_lower in ["parameters", "triggered_by"]:
                            fallback = (
                                "scheduled" if tag_lower == "triggered_by" else "tvoc,pcd,pch"
                            )
                        elif tag_lower in ["hours", "is_operational_hours"]:
                            fallback = False
                        elif tag_lower == "pch_in":
                            fallback = 0
                    finally:
                        if fb_conn:
                            fb_conn.close()

                    return fallback
                return obj
            return obj

        parsed_data = traverse(data)

        # Enforce consistent status casing on ALL `"condition"` values, regardless
        # of where they originated (SP, override, or literal). Case-insensitive.
        def _lowercase_condition(node):
            if isinstance(node, dict):
                for k, v in list(node.items()):
                    if k == "condition" and isinstance(v, str):
                        node[k] = v.lower()
                    else:
                        _lowercase_condition(v)
            elif isinstance(node, list):
                for item in node:
                    _lowercase_condition(item)

        _lowercase_condition(parsed_data)

        final_json_string = json.dumps(parsed_data, indent=2)
        # Belt-and-suspenders: catch any bare bare-string statuses outside `condition:`
        final_json_string = re.sub(
            r'"(GOOD|BAD|MODERATE)"',
            lambda m: f'"{m.group(1).lower()}"',
            final_json_string,
        )

        return final_json_string
    except Exception as e:
        print(f"Template parsing failed: {e}")
        return template_str


def _dispatch_webhook(device_id, payload_str, cursor, payload_type="Scheduled"):
    """POST a payload to the device's Live or Staging URL and log the response."""
    try:
        cursor.execute(
            "SELECT post_data, customer_code FROM tblDeviceMaster WHERE deviceid=%s LIMIT 1",
            (device_id,),
        )
        dev_row = cursor.fetchone()
        if not dev_row or not dev_row.get("post_data"):
            return

        customer_code = dev_row.get("customer_code")
        if not customer_code:
            return

        cursor.execute(
            "SELECT is_staging, post_url_live, post_url_staging FROM tblScheduler WHERE customer_code=%s AND isdeleted=0 LIMIT 1",
            (customer_code,),
        )
        sch_row = cursor.fetchone()
        if not sch_row:
            return

        is_staging = int(sch_row.get("is_staging") or 0)
        env_type = "Staging" if is_staging else "Live"
        target_url = (
            sch_row.get("post_url_staging") if is_staging else sch_row.get("post_url_live")
        )

        if not target_url or not target_url.strip():
            return

        headers = {"Content-type": "application/json"}
        if WOLOO_API_KEY:
            headers["x-api-key"] = WOLOO_API_KEY

        status_text = "ERROR"
        full_response_text = ""
        try:
            data = json.loads(payload_str)
            response = requests.post(target_url, json=data, headers=headers, timeout=5)
            status_text = str(response.status_code)
            full_response_text = response.text
        except Exception as e:
            status_text = f"Err: {str(e)[:40]}"
            full_response_text = str(e)

        try:
            cursor.execute("SAVEPOINT hook_sp")
            cursor.execute(
                """
                INSERT INTO tblPostHistory (deviceid, payload, targeturl, responsestatus, env_type, createddate, remarks, payload_type)
                VALUES (%s, %s::jsonb, %s, %s, %s, NOW(), %s, %s)
                """,
                (
                    device_id,
                    payload_str,
                    target_url,
                    status_text,
                    env_type,
                    full_response_text,
                    payload_type,
                ),
            )
            cursor.execute("RELEASE SAVEPOINT hook_sp")
        except Exception as insert_hook_err:
            cursor.execute("ROLLBACK TO SAVEPOINT hook_sp")
            print(f"Hook History Insert Error: {insert_hook_err}")
    except Exception as hook_err:
        print(f"Webhook Dispatch Error: {hook_err}")
