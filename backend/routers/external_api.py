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

class LocationPayload(BaseModel):
    deviceid: str
    location: str
    address: str
    key: Optional[str] = None

class UpdateDeviceDetailsPayload(BaseModel):
    deviceid: str
    key: Optional[str] = None
    location: Optional[str] = None
    address: Optional[str] = None
    alias: Optional[str] = None
    active: Optional[int] = None
    working_hours_json: Optional[dict] = None


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
            # Verify device explicitly (MAC or Alias)
            cursor.execute("SELECT deviceid FROM tblDeviceMaster WHERE deviceid=%s OR alias=%s", (payload.deviceid, payload.deviceid))
            row = cursor.fetchone()
            if not row:
                _log_api_access("/setworkinghours", caller, log_params, "Error", "Device ID or Alias not found")
                return {"status": "failed", "message": "Device ID or Alias not found"}
                
            actual_device_id = row['deviceid']
            hours_json = json.dumps({"start": payload.start, "end": payload.end})
            cursor.execute("""
                UPDATE tblDeviceMaster 
                SET working_hours_json = %s::jsonb, updatedby = 'via API', updatedDate = CURRENT_TIMESTAMP
                WHERE deviceid = %s
            """, (hours_json, actual_device_id))
            
        conn.commit()
        _log_api_access("/setworkinghours", caller, log_params, "OK", "Inserted successfully")
        return {"status": "OK", "message": "Inserted successfully"}
    except Exception as e:
        _log_api_access("/setworkinghours", caller, log_params, "Error", str(e))
        return {"status": "failed", "message": f"Database error: {str(e)}"}
    finally:
        if conn: conn.close()

@router.post("/setlocation")
async def set_location(payload: LocationPayload, request: Request):
    caller = request.client.host if request.client else "Unknown"
    log_params = payload.dict()
    if 'key' in log_params: del log_params['key'] # Don't log secret key
    
    if not _validate_auth(request, payload.key):
        _log_api_access(apiname="/setlocation", source=caller, params=log_params, status="Error", remarks="Unauthorized - Invalid API Key")
        return {"status": "failed", "message": "Unauthorized API Access"}
        
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            # Verify device explicitly (MAC or Alias)
            cursor.execute("SELECT deviceid FROM tblDeviceMaster WHERE deviceid=%s OR alias=%s", (payload.deviceid, payload.deviceid))
            row = cursor.fetchone()
            if not row:
                _log_api_access("/setlocation", caller, log_params, "Error", "Device ID or Alias not found")
                return {"status": "failed", "message": "Device ID or Alias not found"}
                
            actual_device_id = row['deviceid']
            
            cursor.execute("""
                UPDATE tblDeviceMaster 
                SET location = %s, address = %s, updatedby = 'via API', updatedDate = CURRENT_TIMESTAMP
                WHERE deviceid = %s
            """, (payload.location, payload.address, actual_device_id))
            
        conn.commit()
        _log_api_access("/setlocation", caller, log_params, "OK", "Location and Address updated successfully")
        return {"status": "OK", "message": "Location and Address updated successfully"}
    except Exception as e:
        _log_api_access("/setlocation", caller, log_params, "Error", str(e))
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

@router.post("/updatedevicedetails")
async def update_device_details(payload: UpdateDeviceDetailsPayload, request: Request):
    caller = request.client.host if request.client else "Unknown"
    log_params = payload.dict()
    if 'key' in log_params: del log_params['key']
    
    if not _validate_auth(request, payload.key):
        _log_api_access(apiname="/updatedevicedetails", source=caller, params=log_params, status="Error", remarks="Unauthorized - Invalid API Key")
        return {"status": "failed", "message": "Unauthorized API Access"}
        
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT * FROM tblDeviceMaster WHERE deviceid=%s OR alias=%s", (payload.deviceid, payload.deviceid))
            row = cursor.fetchone()
            if not row:
                _log_api_access("/updatedevicedetails", caller, log_params, "Error", "Device ID or Alias not found")
                return {"status": "failed", "message": "Device ID or Alias not found"}
                
            actual_device_id = row['deviceid']
            
            location = payload.location if payload.location is not None and str(payload.location).strip() != "" else row['location']
            address = payload.address if payload.address is not None and str(payload.address).strip() != "" else row['address']
            alias = payload.alias if payload.alias is not None and str(payload.alias).strip() != "" else row['alias']
            active = payload.active if payload.active is not None else row['active']
            
            existing_whj = row['working_hours_json']
            if not existing_whj:
                existing_whj = {}
            elif isinstance(existing_whj, str):
                try:
                    existing_whj = json.loads(existing_whj)
                except:
                    existing_whj = {}
                    
            if payload.working_hours_json:
                for k, v in payload.working_hours_json.items():
                    if v is not None and str(v).strip() != "" and str(v) != "0":
                        existing_whj[k] = v
                        
            whj_str = json.dumps(existing_whj)
            
            cursor.execute("""
                UPDATE tblDeviceMaster 
                SET location = %s, address = %s, alias = %s, active = %s, working_hours_json = %s::jsonb, updatedby = 'via API', updatedDate = CURRENT_TIMESTAMP
                WHERE deviceid = %s
            """, (location, address, alias, active, whj_str, actual_device_id))
            
        conn.commit()
        _log_api_access("/updatedevicedetails", caller, log_params, "OK", "Device Details updated successfully")
        return {"status": "OK", "message": "Device Details updated successfully"}
    except Exception as e:
        import traceback
        err_details = f"Error: {str(e)}\nTraceback: {traceback.format_exc()}"
        _log_api_access("/updatedevicedetails", caller, log_params, "Error", str(e))
        return {"status": "failed", "message": f"Database error: {str(e)}", "details": err_details}
    finally:
        if conn: conn.close()

@router.get("/getdevicedetails")
async def get_device_details(deviceid: str, request: Request, key: Optional[str] = None):
    caller = request.client.host if request.client else "Unknown"
    log_params = {"deviceid": deviceid}
    
    if not _validate_auth(request, key):
        _log_api_access(apiname="/getdevicedetails", source=caller, params=log_params, status="Error", remarks="Unauthorized - Invalid API Key")
        return {"status": "failed", "message": "Unauthorized API Access"}
        
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT deviceid, alias, location, address, working_hours_json, active FROM tblDeviceMaster WHERE deviceid=%s OR alias=%s", (deviceid, deviceid))
            row = cursor.fetchone()
            if not row:
                _log_api_access("/getdevicedetails", caller, log_params, "Error", "Device ID or Alias not found")
                return {"status": "failed", "message": "Device ID or Alias not found"}
            
            whj = row['working_hours_json']
            if isinstance(whj, str):
                try:
                    whj = json.loads(whj)
                except:
                    whj = {}
            elif not whj:
                whj = {}
            row['working_hours_json'] = whj
            
            _log_api_access("/getdevicedetails", caller, log_params, "OK", "Fetched successfully")
            return {"status": "success", "data": dict(row)}
    except Exception as e:
        import traceback
        err_details = f"Error: {str(e)}\nTraceback: {traceback.format_exc()}"
        _log_api_access("/getdevicedetails", caller, log_params, "Error", str(e))
        return {"status": "failed", "message": f"Database error: {str(e)}", "details": err_details}
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
