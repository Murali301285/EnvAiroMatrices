from fastapi import APIRouter, Query
from typing import Optional
from database import get_db_connection

router = APIRouter(prefix="/api", tags=["API Viewer"])

@router.get("/viewer")
def get_top_2000_data():
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT * FROM tblDatareceiver ORDER BY receivedOn DESC LIMIT 5000")
            result = cursor.fetchall()
            return {"status": "success", "data": result}
    except Exception as e:
        return {"status": "error", "message": str(e)}
    finally:
        conn.close()

@router.get("/view")
def get_view_records():
    """Returns top 1000 telemetry records from history regardless of deviceid, specifically extracting device, raw text, and timestamp."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT deviceid, revText, TO_CHAR(receivedOn, 'DD-MM-YYYY HH12:MI:SS AM') AS receivedOn FROM tblDatareceiverHistory ORDER BY slno DESC LIMIT 5000")
            result = cursor.fetchall()
            return {"status": "success", "count": len(result), "data": result}
    except Exception as e:
        return {"status": "error", "message": str(e)}
    finally:
        conn.close()

# --- Advanced Dashboard Endpoints ---

@router.get("/dashboard/devices")
def get_dashboard_devices():
    """Returns absolute list of active devices for the dropdown"""
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT deviceid, alias, location, customer_code FROM tblDeviceMaster WHERE isDeleted=0")
            devices = cursor.fetchall()
            return {"status": "success", "data": devices}
    except Exception as e:
        return {"status": "error", "message": str(e)}
    finally:
        conn.close()

@router.get("/dashboard/devices/{deviceid}/params")
def get_dashboard_device_params(deviceid: str):
    """Returns the dynamically mapped parameters for a specific device"""
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            query = """
                SELECT p.parameterName, p.labelName, p.param_tag, p.color, p.unit, p.DataType, p.DecimalPlaces, p.ValueFactor, m.api_rev_tag 
                FROM tblDeviceParameterMapping m 
                JOIN tblParameterMaster p ON m.parameter_id = p.slno 
                WHERE m.deviceid = %s AND m.api_rev_tag IS NOT NULL AND m.api_rev_tag != ''
                ORDER BY p.slno ASC
            """
            cursor.execute(query, (deviceid,))
            params = cursor.fetchall()
            return {"status": "success", "data": params}
    except Exception as e:
        return {"status": "error", "message": str(e)}
    finally:
        conn.close()

@router.get("/dashboard/telemetry")
def get_dashboard_telemetry(
    device_id: Optional[str] = None,
    from_date: Optional[str] = None, # format: YYYY-MM-DD HH:MM:SS
    to_date: Optional[str] = None,
    limit: int = 1000
):
    """Complex filter for retrieving time-bounded telemetry matching UI filters"""
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            query = "SELECT d.slno, d.deviceid, d.revText, d.receivedOn, m.location, m.alias FROM tblDatareceiverHistory d LEFT JOIN tblDeviceMaster m ON d.deviceid = m.deviceid WHERE 1=1"
            params = []
            
            if device_id:
                query += " AND d.deviceid = %s"
                params.append(device_id)
            if from_date:
                query += " AND d.receivedOn >= %s"
                params.append(from_date)
            if to_date:
                query += " AND d.receivedOn <= %s"
                params.append(to_date)
                
            query += f" ORDER BY d.receivedOn DESC LIMIT {limit}"
            
            cursor.execute(query, tuple(params))
            results = cursor.fetchall()
            
            # Identify distinct logical dates in the fetched subset to pull 00:00:00 reference seeds
            day_seeds = {}
            if device_id and results:
                import datetime
                target_dates = set()
                for r in results:
                    recv = r.get('receivedOn', r.get('receivedon'))
                    if isinstance(recv, str):
                        try:
                            recv = datetime.datetime.fromisoformat(recv.replace('Z', '+00:00').split('.')[0])
                        except:
                            recv = None
                    if recv and isinstance(recv, datetime.datetime):
                        target_dates.add(recv.date())

                for target_date in target_dates:
                    start_of_day = datetime.datetime.combine(target_date, datetime.time.min)
                    seed_query = "SELECT revText FROM tblDatareceiverHistory WHERE deviceid = %s AND receivedOn >= %s ORDER BY receivedOn ASC LIMIT 1"
                    cursor.execute(seed_query, (device_id, start_of_day))
                    seed_res = cursor.fetchone()
                    if seed_res:
                        rev_text_val = seed_res.get('revText', seed_res.get('revtext'))
                        day_seeds[target_date.strftime("%Y-%m-%d")] = rev_text_val

            # Formulate the response
            return {
                "status": "success", 
                "count": len(results),
                "data": results,
                "day_seeds": day_seeds
            }
    except Exception as e:
        return {"status": "error", "message": str(e)}
    finally:
        conn.close()
