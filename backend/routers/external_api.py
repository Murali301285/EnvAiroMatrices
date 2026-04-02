from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
from database import get_db_connection
import json
import re

router = APIRouter(prefix="/api/v1")

API_SECRET = "$woloo_Api#2026"

class WorkingHoursPayload(BaseModel):
    deviceid: str
    start: str
    end: str
    key: Optional[str] = None # Support fallback inside payload if headers fail

class ThresholdPayload(BaseModel):
    source: str
    limit: int
    key: Optional[str] = None

def _log_api_access(apiname: str, source: str, params: dict, status: str, remarks: str = ""):
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("""
                INSERT INTO tblApiAccessLogs (apiname, source, params, status, remarks)
                VALUES (%s, %s, %s::jsonb, %s, %s)
            """, (apiname, source, json.dumps(params), status, remarks))
        conn.commit()
    except Exception as e:
        print(f"Audit Log Error: {e}")
    finally:
        if conn: conn.close()

def _validate_auth(request: Request, payload_key: str = None):
    auth_header = request.headers.get("Authorization")
    api_key_header = request.headers.get("X-Api-Key")
    
    if payload_key == API_SECRET or auth_header == API_SECRET or api_key_header == API_SECRET:
        return True
    return False

@router.post("/setworkinghours")
async def set_working_hours(payload: WorkingHoursPayload, request: Request):
    caller = request.client.host if request.client else "Unknown"
    log_params = payload.dict()
    if 'key' in log_params: del log_params['key'] # Don't log secret key
    
    if not _validate_auth(request, payload.key):
        _log_api_access(apiname="/setworkinghours", source=caller, params=log_params, status="Error", remarks="Unauthorized - Invalid API Key")
        return {"status": "failed", "message": "Unauthorized API Access"}
        
    time_pattern = re.compile(r'^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$')
    if not time_pattern.match(payload.start) or not time_pattern.match(payload.end):
        error_msg = f"Invalid time format (Expected HH:MM). Received start: '{payload.start}', end: '{payload.end}'"
        _log_api_access(apiname="/setworkinghours", source=caller, params=log_params, status="Error", remarks=error_msg)
        return {"status": "failed", "message": error_msg}
        
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            # Verify device explicitly
            cursor.execute("SELECT slno FROM tblDeviceMaster WHERE deviceid=%s", (payload.deviceid,))
            if not cursor.fetchone():
                _log_api_access("/setworkinghours", caller, log_params, "Error", "Device ID not found")
                return {"status": "failed", "message": "Device ID not found"}
                
            hours_json = json.dumps({"start": payload.start, "end": payload.end})
            cursor.execute("""
                UPDATE tblDeviceMaster 
                SET working_hours_json = %s::jsonb, updatedby = 'via API', updatedDate = CURRENT_TIMESTAMP
                WHERE deviceid = %s
            """, (hours_json, payload.deviceid))
            
        conn.commit()
        _log_api_access("/setworkinghours", caller, log_params, "OK", "Inserted successfully")
        return {"status": "OK", "message": "Inserted successfully"}
    except Exception as e:
        _log_api_access("/setworkinghours", caller, log_params, "Error", str(e))
        return {"status": "failed", "message": f"Database error: {str(e)}"}
    finally:
        if conn: conn.close()


@router.post("/setpeoplethreshold")
async def set_people_threshold(payload: ThresholdPayload, request: Request):
    caller = request.client.host if request.client else "Unknown"
    log_params = payload.dict()
    if 'key' in log_params: del log_params['key']
    
    if not _validate_auth(request, payload.key):
        _log_api_access(apiname="/setpeoplethreshold", source=caller, params=log_params, status="Error", remarks="Unauthorized - Invalid API Key")
        return {"status": "failed", "message": "Unauthorized API Access"}
        
    # User's request logic: update the limit based on the company name mapped dynamically
    company_match = payload.source
    
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            # Check if company exists directly under customerName (case insensitive)
            cursor.execute("SELECT customer_code FROM tblCustomerMaster WHERE LOWER(customerName) = LOWER(%s)", (company_match,))
            record = cursor.fetchone()
            if not record:
                _log_api_access("/setpeoplethreshold", caller, log_params, "Error", f"Company source '{company_match}' not found")
                return {"status": "failed", "message": "Company Source not found"}
                
            cursor.execute("""
                UPDATE tblCustomerMaster 
                SET peoplelimit = %s 
                WHERE LOWER(customerName) = LOWER(%s)
            """, (payload.limit, company_match))
            
        conn.commit()
        _log_api_access("/setpeoplethreshold", caller, log_params, "OK", "Inserted successfully")
        return {"status": "OK", "message": "Inserted successfully"}
    except Exception as e:
        _log_api_access("/setpeoplethreshold", caller, log_params, "Error", str(e))
        return {"status": "failed", "message": f"Database error: {str(e)}"}
    finally:
        if conn: conn.close()

# Internal API to fetch the Logs natively for the Dashboard UI
@router.get("/apilogs")
async def get_api_logs(limit: int = 100):
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT * FROM tblApiAccessLogs ORDER BY accessedon DESC LIMIT %s", (limit,))
            logs = cursor.fetchall()
            for row in logs:
                if row.get('accessedon'):
                    row['accessedon'] = row['accessedon'].isoformat()
            return {"status": "success", "data": logs}
    except Exception as e:
        return {"status": "error", "message": str(e)}
    finally:
        if conn: conn.close()
