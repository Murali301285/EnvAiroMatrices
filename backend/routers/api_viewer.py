from fastapi import APIRouter, Query
from typing import Optional
from database import get_db_connection

router = APIRouter(prefix="/api", tags=["API Viewer"])

@router.get("/viewer")
def get_top_2000_data():
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT * FROM tblDatareceiver ORDER BY receivedOn DESC LIMIT 2000")
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
            cursor.execute("SELECT deviceid, revText, receivedOn FROM tblDatareceiverHistory ORDER BY receivedOn DESC LIMIT 1000")
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
                SELECT p.parameterName, p.labelName, p.param_tag, p.color, p.unit, m.api_rev_tag 
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
            
            # Formulate the response
            return {
                "status": "success", 
                "count": len(results),
                "data": results
            }
    except Exception as e:
        return {"status": "error", "message": str(e)}
    finally:
        conn.close()
