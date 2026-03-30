from fastapi import APIRouter, Request, HTTPException
from database import get_db_connection
import json
import bcrypt
import os
from logger import log_error, log_event

router = APIRouter(prefix="/admin", tags=["Admin Config Area"])

@router.post("/login")
async def authenticate_user(request: Request):
    payload = await request.json()
    login_id = payload.get('loginId')
    password = payload.get('password')
    
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT slno, firstname, lastname, loginid, password, userrole, companycodes FROM tblusers WHERE LOWER(loginid)=LOWER(%s) AND isdeleted=0", (login_id,))
            row = cursor.fetchone()
            if row:
                stored_password = row['password']
                # Check bcrypt or fallback to plain text if not hashed
                is_valid = False
                try:
                    is_valid = bcrypt.checkpw(password.encode('utf-8'), stored_password.encode('utf-8'))
                except ValueError:
                    is_valid = (password == stored_password)
                
                if is_valid:
                    del row['password'] # Remove hash from frontend payload
                    return {"status": "success", "data": dict(row)}
                else:
                    return {"status": "error", "message": "Invalid Login ID or Password"}
    except Exception as e:
        return {"status": "error", "message": str(e)}
    finally:
        if conn: conn.close()


def execute_query(query: str, params: tuple = (), fetchResult: bool = True):
    conn = get_db_connection()
    try:
        data = None
        with conn.cursor() as cursor:
            cursor.execute(query, params)
            
            if cursor.description is not None:
                if fetchResult:
                    data = cursor.fetchall()
                else:
                    row = cursor.fetchone()
                    data = dict(row) if row else None
            
            # Always commit data mutations
            conn.commit()
            
        return {"status": "success", "data": data}
    except Exception as e:
        if conn:
            conn.rollback()
        log_error("Database (Admin API)", str(e))
        return {"status": "error", "message": str(e)}
    finally:
        if conn:
            conn.close()

# ----- CUSTOMERS -----
@router.get("/customers")
def get_customers():
    return execute_query("SELECT slno, customerName, customer_code, details FROM tblCustomerMaster WHERE isDeleted=0")

@router.post("/customers")
async def add_customer(request: Request):
    payload = await request.json()
    details = json.dumps(payload.get('details', {}))
    sql = "INSERT INTO tblCustomerMaster (customerName, customer_code, details, createdBy) VALUES (%s, %s, %s, %s) RETURNING slno"
    return execute_query(sql, (payload.get('customerName'), payload.get('customer_code'), details, payload.get('createdBy', 'Admin')), False)

# ----- PARAMETERS -----
@router.get("/parameters")
def get_params():
    return execute_query("SELECT slno, parameterName, param_tag, labelName, color, unit, conversionFactor, valueFactor, inputField, status, datatype, decimalplaces FROM tblParameterMaster WHERE isDeleted=0")

@router.post("/parameters")
async def add_param(request: Request):
    p = await request.json()
    sql = "INSERT INTO tblParameterMaster (parameterName, param_tag, labelName, color, unit, conversionFactor, valueFactor, inputField, status, datatype, decimalplaces) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING slno"
    return execute_query(sql, (p.get('parameterName'), p.get('param_tag'), p.get('labelName'), p.get('color'), p.get('unit'), p.get('conversionFactor'), p.get('valueFactor', 'Avg'), p.get('inputField'), p.get('status', 1), p.get('datatype', 'Decimal'), p.get('decimalplaces')), False)

# ----- DEVICES -----
@router.get("/devices")
def get_devices():
    return execute_query("SELECT slno, customer_code, deviceid, alias, location, address, working_hours_json, active, remarks FROM tblDeviceMaster WHERE isDeleted=0")

@router.post("/devices")
async def add_device(request: Request):
    p = await request.json()
    whj = json.dumps(p.get('working_hours_json', {}))
    sql = "INSERT INTO tblDeviceMaster (customer_code, deviceid, alias, location, address, working_hours_json, active, remarks) VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING slno"
    return execute_query(sql, (p.get('customer_code'), p.get('deviceid'), p.get('alias'), p.get('location'), p.get('address'), whj, p.get('active', 1), p.get('remarks')), False)

# ----- JSON FORMATTERS -----
@router.get("/formatters")
def get_formatters():
    return execute_query("SELECT slno, name, jsonTemplate, storedProcedureName, type FROM tblJsonFormatter WHERE isDeleted=0")

@router.post("/formatters")
async def add_formatter(request: Request):
    p = await request.json()
    sql = "INSERT INTO tblJsonFormatter (name, jsonTemplate, storedProcedureName, type) VALUES (%s, %s, %s, %s) RETURNING slno"
    return execute_query(sql, (p.get('name'), p.get('jsonTemplate'), p.get('storedProcedureName'), p.get('type')), False)

# ----- PAGES -----
@router.get("/pages")
def get_pages():
    return execute_query("SELECT slno, PageName, Path, Description FROM tblPages WHERE isDeleted=0")

@router.post("/pages")
async def add_page(request: Request):
    p = await request.json()
    sql = "INSERT INTO tblPages (PageName, Path, Description) VALUES (%s, %s, %s) RETURNING slno"
    return execute_query(sql, (p.get('PageName'), p.get('Path'), p.get('Description')), False)

# ----- USERS -----
@router.get("/users")
def get_users():
    return execute_query("SELECT slno, firstname, lastname, loginid, userrole, companycodes FROM tblusers WHERE isdeleted=0")

@router.post("/users")
async def add_user(request: Request):
    p = await request.json()
    comp = json.dumps(p.get('companycodes', p.get('company', p.get('Company', []))))
    
    raw_pass = p.get('password', p.get('Password', ''))
    hashed_pass = bcrypt.hashpw(raw_pass.encode('utf-8'), bcrypt.gensalt()).decode('utf-8') if raw_pass else ''

    sql = "INSERT INTO tblusers (firstname, lastname, loginid, password, userrole, companycodes) VALUES (%s, %s, %s, %s, %s, %s) RETURNING slno"
    return execute_query(sql, (p.get('firstname', p.get('First_Name')), p.get('lastname', p.get('Last_Name')), p.get('loginid', p.get('LoginId')), hashed_pass, p.get('userrole', p.get('User_role')), comp), False)

# ----- DEVICE PARAM MAPPING -----
@router.get("/param-mapping")
def get_param_mappings():
    return execute_query("SELECT slno, deviceid, parameter_id, api_rev_tag FROM tblDeviceParameterMapping WHERE isDeleted=0")

@router.post("/param-mapping-bulk")
async def bulk_param_mapping(request: Request):
    p = await request.json()
    deviceid = p.get('deviceid')
    mappings = p.get('mappings', [])
    
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM tblDeviceParameterMapping WHERE deviceid=%s", (deviceid,))
            for m in mappings:
                if m.get('api_rev_tag'):
                    cursor.execute("INSERT INTO tblDeviceParameterMapping (deviceid, parameter_id, api_rev_tag) VALUES (%s, %s, %s)", (deviceid, m.get('parameter_id'), m.get('api_rev_tag')))
            conn.commit()
        return {"status": "success"}
    except Exception as e:
        if conn: conn.rollback()
        return {"status": "error", "message": str(e)}
    finally:
        if conn: conn.close()

# ----- DEVICE JSON MAPPING -----
@router.get("/json-mapping")
def get_json_mappings():
    return execute_query("SELECT slno, deviceid, scheduledjsonid AS scheduled_json_id, alertjsonid AS alert_json_id, resolvedjsonid AS resolved_json_id FROM tblDeviceJsonMapping WHERE isDeleted=0")

@router.post("/json-mapping")
async def add_json_mapping(request: Request):
    p = await request.json()
    dev = p.get('deviceid')
    
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM tblDeviceJsonMapping WHERE deviceid=%s", (dev,))
            cursor.execute("INSERT INTO tblDeviceJsonMapping (deviceid, scheduledjsonid, alertjsonid, resolvedjsonid) VALUES (%s, %s, %s, %s)", (dev, p.get('scheduled_json_id'), p.get('alert_json_id'), p.get('resolved_json_id')))
            conn.commit()
        return {"status": "success"}
    except Exception as e:
        if conn: conn.rollback()
        return {"status": "error", "message": str(e)}
    finally:
        if conn: conn.close()

# ----- SCHEDULER -----
@router.get("/schedulers")
def get_schedulers():
    return execute_query("SELECT slno, deviceid, frequency, starting_time, create_local_json, alert_req, alert_freq, post_url_staging, is_staging, post_url_live FROM tblScheduler WHERE isDeleted=0")

@router.post("/schedulers")
async def add_scheduler(request: Request):
    p = await request.json()
    sql = "INSERT INTO tblScheduler (deviceid, frequency, starting_time, create_local_json, alert_req, alert_freq, post_url_staging, is_staging, post_url_live) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING slno"
    return execute_query(sql, (p.get('deviceid'), p.get('frequency'), p.get('starting_time'), p.get('create_local_json', False), p.get('alert_req', False), p.get('alert_freq'), p.get('post_url_staging'), p.get('is_staging', False), p.get('post_url_live')), False)

# ----- UNIVERSAL EDIT AND DELETE ENDPOINTS -----
@router.delete("/{entity}/{slno}")
def delete_entity(entity: str, slno: int):
    table_map = {
        'customers': 'tblCustomerMaster',
        'parameters': 'tblParameterMaster',
        'devices': 'tblDeviceMaster',
        'formatters': 'tblJsonFormatter',
        'pages': 'tblPages',
        'users': 'tblUsers',
        'param-mapping': 'tblDeviceParameterMapping',
        'json-mapping': 'tblDeviceJsonMapping',
        'schedulers': 'tblScheduler'
    }
    if entity not in table_map:
        return {"status": "error", "message": "Invalid entity context"}
    return execute_query(f"UPDATE {table_map[entity]} SET isDeleted=1 WHERE slno=%s", (slno,), False)

@router.put("/{entity}/{slno}")
async def update_entity(entity: str, slno: int, request: Request):
    p = await request.json()
    if entity == "customers":
        details = json.dumps(p.get('details', {}))
        return execute_query("UPDATE tblCustomerMaster SET customerName=%s, customer_code=%s, details=%s WHERE slno=%s", (p.get('customerName'), p.get('customer_code'), details, slno), False)
    elif entity == "parameters":
        return execute_query("UPDATE tblParameterMaster SET parameterName=%s, param_tag=%s, labelName=%s, color=%s, unit=%s, conversionFactor=%s, valueFactor=%s, inputField=%s, status=%s, datatype=%s, decimalplaces=%s WHERE slno=%s", (p.get('parameterName'), p.get('param_tag'), p.get('labelName'), p.get('color'), p.get('unit'), p.get('conversionFactor'), p.get('valueFactor', 'Avg'), p.get('inputField'), p.get('status', 1), p.get('datatype', 'Decimal'), p.get('decimalplaces'), slno), False)
    elif entity == "devices":
        whj = json.dumps(p.get('working_hours_json', {}))
        return execute_query("UPDATE tblDeviceMaster SET customer_code=%s, deviceid=%s, alias=%s, location=%s, address=%s, working_hours_json=%s, active=%s, remarks=%s WHERE slno=%s", (p.get('customer_code'), p.get('deviceid'), p.get('alias'), p.get('location'), p.get('address'), whj, p.get('active', 1), p.get('remarks'), slno), False)
    elif entity == "formatters":
        return execute_query("UPDATE tblJsonFormatter SET name=%s, jsonTemplate=%s, storedProcedureName=%s, type=%s WHERE slno=%s", (p.get('name'), p.get('jsonTemplate'), p.get('storedProcedureName'), p.get('type'), slno), False)
    elif entity == "pages":
        return execute_query("UPDATE tblPages SET PageName=%s, Path=%s, Description=%s WHERE slno=%s", (p.get('PageName'), p.get('Path'), p.get('Description'), slno), False)
    elif entity == "users":
        comp = json.dumps(p.get('companycodes', p.get('company', p.get('Company', []))))
        raw_pass = p.get('password', '')
        if raw_pass:
            hashed_pass = bcrypt.hashpw(raw_pass.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
            return execute_query("UPDATE tblusers SET firstname=%s, lastname=%s, loginid=%s, password=%s, userrole=%s, companycodes=%s WHERE slno=%s", (p.get('firstname'), p.get('lastname'), p.get('loginid'), hashed_pass, p.get('userrole'), comp, slno), False)
        return execute_query("UPDATE tblusers SET firstname=%s, lastname=%s, loginid=%s, userrole=%s, companycodes=%s WHERE slno=%s", (p.get('firstname'), p.get('lastname'), p.get('loginid'), p.get('userrole'), comp, slno), False)
    elif entity == "param-mapping":
        return execute_query("UPDATE tblDeviceParameterMapping SET deviceid=%s, parameter_id=%s, api_rev_tag=%s WHERE slno=%s", (p.get('deviceid'), p.get('parameter_id'), p.get('api_rev_tag'), slno), False)
    elif entity == "json-mapping":
        return execute_query("UPDATE tblDeviceJsonMapping SET deviceid=%s, scheduledjsonid=%s, alertjsonid=%s, resolvedjsonid=%s WHERE slno=%s", (p.get('deviceid'), p.get('scheduled_json_id'), p.get('alert_json_id'), p.get('resolved_json_id'), slno), False)
    elif entity == "schedulers":
        return execute_query("UPDATE tblScheduler SET deviceid=%s, frequency=%s, starting_time=%s, create_local_json=%s, alert_req=%s, alert_freq=%s, post_url_staging=%s, is_staging=%s, post_url_live=%s WHERE slno=%s", (p.get('deviceid'), p.get('frequency'), p.get('starting_time'), p.get('create_local_json', False), p.get('alert_req', False), p.get('alert_freq'), p.get('post_url_staging'), p.get('is_staging', False), p.get('post_url_live'), slno), False)
    
    return {"status": "error", "message": "Invalid entity context"}

# ----- LOG VIEWER APIS -----
@router.get("/logs/errors")
def get_error_logs():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    err_dir = os.path.join(base_dir, "ErrorLogs")
    
    if not os.path.exists(err_dir):
        return {"status": "success", "data": []}
        
    content = ""
    # Parse all available error logs to compile unified telemetry
    for fname in os.listdir(err_dir):
        if fname.endswith("_errors.txt"):
            with open(os.path.join(err_dir, fname), "r", encoding="utf-8") as f:
                content += f.read() + "\n"
                
    logs = []
        
    blocks = content.split("==============")
    for b in blocks:
        b = b.strip()
        if not b: continue
        
        lines = b.split("\\n")
        source = "Unknown"
        dt = "Unknown"
        err = "Unknown"
        
        for line in lines:
            if line.startswith("Error:") and source == "Unknown":
                source = line.replace("Error:", "", 1).strip()
            elif line.startswith("DateTime:"):
                dt = line.replace("DateTime:", "", 1).strip()
            elif line.startswith("Error:") and source != "Unknown":
                err = line.replace("Error:", "", 1).strip()
            elif not line.startswith("Error:") and not line.startswith("DateTime:"):
                # Multiline error fallback
                err += " " + line.strip()
                
        logs.append({
            "source": source,
            "datetime": dt,
            "error_message": err
        })
        
    return {"status": "success", "data": list(reversed(logs))}

@router.get("/logs/events")
def get_event_logs(date: str = None):
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    event_dir = os.path.join(base_dir, "EventLogs")
    
    if not os.path.exists(event_dir):
        return {"status": "success", "available_dates": [], "data": []}
        
    files = [f for f in os.listdir(event_dir) if f.endswith("_events.txt")]
    files.sort(reverse=True) # newest first roughly by filename if named DDMMYYYY... wait DDMMYYYY sorts badly.
    # robust sort by DDMMYYYY
    def parse_date(fname):
        try:
            return fname[:8]
        except:
            return "00000000"
            
    files.sort(key=lambda x: x[4:8] + x[2:4] + x[0:2], reverse=True)
    
    available_dates = [f[:8] for f in files]
    
    if not files:
        return {"status": "success", "available_dates": [], "data": []}
        
    # By default, load the most recent date if none requested
    target_date = date if date else available_dates[0]
    target_file = f"{target_date}_events.txt"
    target_path = os.path.join(event_dir, target_file)
    
    logs = []
    if os.path.exists(target_path):
        with open(target_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line: continue
                # format: [HH:MM:SS] message
                if line.startswith("[") and "]" in line:
                    time_part = line[1:line.find("]")]
                    msg = line[line.find("]")+1:].strip()
                    logs.append({"time": time_part, "message": msg})
                else:
                    logs.append({"time": "Unknown", "message": line})
                    
    return {
        "status": "success", 
        "available_dates": available_dates, 
        "current_date": target_date,
        "data": list(reversed(logs))
    }

