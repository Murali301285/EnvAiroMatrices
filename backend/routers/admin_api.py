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
                    
                    # Fetch permissions from tbl_user_roles dynamically
                    userrole = row.get('userrole') or ''
                    role_str = userrole.strip()
                    
                    # Normalization mappings for direct matches
                    role_mapping = {
                        'admin': 'System Admin',
                        'user': 'Guest Operator',
                        'operator': 'Guest Operator'
                    }
                    target_role = role_mapping.get(role_str.lower(), role_str)
                    
                    mobile_perms = []
                    
                    # Try direct match
                    cursor.execute("SELECT mobile_permissions FROM tbl_user_roles WHERE LOWER(role_name) = LOWER(%s) AND is_deleted = 0", (target_role,))
                    perm_row = cursor.fetchone()
                    if perm_row:
                        mobile_perms = perm_row['mobile_permissions'] or []
                    else:
                        # Try matching original role_str directly
                        cursor.execute("SELECT mobile_permissions FROM tbl_user_roles WHERE LOWER(role_name) = LOWER(%s) AND is_deleted = 0", (role_str,))
                        perm_row = cursor.fetchone()
                        if perm_row:
                            mobile_perms = perm_row['mobile_permissions'] or []
                        else:
                            # Fuzzy matching fallback
                            cursor.execute("SELECT role_name, mobile_permissions FROM tbl_user_roles WHERE is_deleted = 0")
                            all_roles = cursor.fetchall()
                            for r in all_roles:
                                if role_str.lower() in r['role_name'].lower() or r['role_name'].lower() in role_str.lower():
                                    mobile_perms = r['mobile_permissions'] or []
                                    break
                                    
                    # SECURITY CHECK: If permissions are empty or Main view is not granted, block access!
                    if not mobile_perms or 'Main' not in mobile_perms:
                        return {"status": "error", "message": "Access denied. Contact Admin."}
                        
                    # Append mobile_permissions to the user payload
                    user_data = dict(row)
                    user_data['mobile_permissions'] = mobile_perms
                    
                    return {"status": "success", "data": user_data}
                else:
                    return {"status": "error", "message": "Invalid Login ID or Password"}
            else:
                return {"status": "error", "message": "Invalid Login ID or Password"}
    except Exception as e:
        import traceback
        log_error("Login API Authentication", f"{str(e)}\n{traceback.format_exc()}")
        return {"status": "error", "message": str(e)}
    finally:
        if conn: conn.close()


@router.put("/profile/{slno:int}")
async def update_profile(slno: int, request: Request):
    p = await request.json()
    firstname = p.get('firstname')
    lastname = p.get('lastname')
    email = p.get('email')
    remarks = p.get('remarks')
    profile_image = p.get('profile_image') # Base64 encoded string or None
    password = p.get('password') # Optional password field
    
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            # If password is provided, we hash it and update
            if password and password.strip():
                hashed_pass = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
                cursor.execute("""
                    UPDATE tblusers 
                    SET firstname=%s, lastname=%s, email=%s, remarks=%s, profile_image=%s, password=%s, updateddate=CURRENT_TIMESTAMP
                    WHERE slno=%s AND isdeleted=0
                """, (firstname, lastname, email, remarks, profile_image, hashed_pass, slno))
            else:
                cursor.execute("""
                    UPDATE tblusers 
                    SET firstname=%s, lastname=%s, email=%s, remarks=%s, profile_image=%s, updateddate=CURRENT_TIMESTAMP
                    WHERE slno=%s AND isdeleted=0
                """, (firstname, lastname, email, remarks, profile_image, slno))
            
            conn.commit()
            
            # Re-fetch the updated user record including its permissions
            cursor.execute("""
                SELECT u.slno, u.firstname, u.lastname, u.loginid, u.userrole, u.companycodes,
                       u.email, u.remarks, u.profile_image,
                       r.web_permissions, r.mobile_permissions
                FROM tblusers u
                LEFT JOIN tbl_user_roles r ON LOWER(u.userrole) = LOWER(r.role_name) AND r.is_deleted = 0
                WHERE u.slno = %s AND u.isdeleted = 0
            """, (slno,))
            row = cursor.fetchone()
            if row:
                # Backwards compatibility / defaults safety clamp
                if not row.get('web_permissions') and (row.get('userrole') == 'Admin' or row.get('userrole') == 'SYS_ADMIN'):
                    row['web_permissions'] = {
                        "Home": ["Main", "Dynamic"],
                        "Config": ["Customers", "Parameters", "Devices", "Param Mapping", "JSON Formatter", "JSON Mapping", "Scheduler", "Users"],
                        "Logs": ["Alert Monitor", "PCH Logs", "API Post Monitor", "JSON Monitor", "API Access Logs", "Error", "Events"]
                    }
                    row['mobile_permissions'] = ["Main", "Analytics", "Enterprise"]
                elif not row.get('web_permissions'):
                    row['web_permissions'] = {
                        "Home": ["Main", "Dynamic"]
                    }
                    row['mobile_permissions'] = ["Main"]
                
                return {"status": "success", "data": dict(row)}
            else:
                return {"status": "error", "message": "User not found after update"}
    except Exception as e:
        if conn: conn.rollback()
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

# ----- ALERTS -----
@router.get("/alerts")
def get_alerts(from_date: str = None, to_date: str = None, alert_type: str = "TVOC"):
    if alert_type == "TVOC":
        query = """
            SELECT slno, DeviceId as deviceid, 'TVOC' as param_tag, 
                   TO_CHAR(CDatetime, 'YYYY-MM-DD HH24:MI:SS') as createdon, 
                   count as alertsequence, 
                   TO_CHAR(lastupdatedon, 'YYYY-MM-DD HH24:MI:SS') as lastrunon, 
                   continousbad as consucutive_minutes, isResolved as isresolved, 
                   CASE WHEN isResolved=1 THEN TO_CHAR(statuschangedon, 'YYYY-MM-DD HH24:MI:SS') ELSE NULL END as resolvedon, 
                   currentstatus, tvoc_value, remarks 
            FROM tblAlertBucketTVOC
            WHERE 1=1
        """
        params = []
        if from_date:
            query += " AND DATE(CDatetime) >= %s"
            params.append(from_date)
        if to_date:
            query += " AND DATE(CDatetime) <= %s"
            params.append(to_date)
            
        query += " ORDER BY slno DESC LIMIT 100"
        return execute_query(query, tuple(params))
    elif alert_type == "PCH":
        query = """
            SELECT slno, deviceid, 'PCH' as param_tag, 
                   TO_CHAR(created_on, 'YYYY-MM-DD HH24:MI:SS') as createdon, 
                   1 as alertsequence, 
                   TO_CHAR(created_on, 'YYYY-MM-DD HH24:MI:SS') as lastrunon, 
                   timeframe as consucutive_minutes, isresolved, 
                   CASE WHEN isresolved=1 THEN TO_CHAR(resolvedon, 'YYYY-MM-DD HH24:MI:SS') ELSE NULL END as resolvedon, 
                   currentstatus, pchcount as tvoc_value, remarks 
            FROM tbl_pch_alert
            WHERE isalertrequired = True
        """
        params = []
        if from_date:
            query += " AND DATE(created_on) >= %s"
            params.append(from_date)
        if to_date:
            query += " AND DATE(created_on) <= %s"
            params.append(to_date)
            
        query += " ORDER BY slno DESC LIMIT 100"
        return execute_query(query, tuple(params))
    else:
        query = """
            SELECT slno, Deviceid as deviceid, param_tag, 
                   TO_CHAR(Createdon, 'YYYY-MM-DD HH24:MI:SS') as createdon, 
                   AlertSequence as alertsequence, 
                   TO_CHAR(LastRunOn, 'YYYY-MM-DD HH24:MI:SS') as lastrunon, 
                   consucutive_minutes, isResolved as isresolved, 
                   CASE WHEN isResolved=1 THEN TO_CHAR(ResolvedOn, 'YYYY-MM-DD HH24:MI:SS') ELSE NULL END as resolvedon 
            FROM tblAlertScheduler
            WHERE param_tag = %s
        """
        params = [alert_type]
        if from_date:
            query += " AND DATE(Createdon) >= %s"
            params.append(from_date)
        if to_date:
            query += " AND DATE(Createdon) <= %s"
            params.append(to_date)
            
        query += " ORDER BY slno DESC LIMIT 100"
        return execute_query(query, tuple(params))

# Acknowledge / Resolve an alert bucket manually
@router.post("/alerts/{alert_type}/{slno}/acknowledge")
def acknowledge_alert(alert_type: str, slno: int):
    table_map = {
        'TVOC': 'tblAlertBucketTVOC',
        'PCH': 'tbl_pch_alert'
    }
    if alert_type not in table_map:
        return {"status": "error", "message": "Invalid alert type"}
        
    if alert_type == 'PCH':
        query = """
            UPDATE tbl_pch_alert
            SET isresolved = 1, currentstatus = 'Resolved', resolvedon = CURRENT_TIMESTAMP
            WHERE slno = %s
        """
    else:
        query = f"""
            UPDATE {table_map[alert_type]}
            SET isresolved = 1, currentstatus = 'Resolved', statuschangedon = CURRENT_TIMESTAMP
            WHERE slno = %s
        """
    return execute_query(query, (slno,), False)

# Save remark for an alert bucket
@router.post("/alerts/{alert_type}/{slno}/remark")
async def save_alert_remark(alert_type: str, slno: int, request: Request):
    payload = await request.json()
    remark = payload.get('remark', '')
    
    table_map = {
        'TVOC': 'tblAlertBucketTVOC',
        'PCH': 'tbl_pch_alert'
    }
    if alert_type not in table_map:
        return {"status": "error", "message": "Invalid alert type"}
        
    query = f"""
        UPDATE {table_map[alert_type]}
        SET remarks = %s
        WHERE slno = %s
    """
    return execute_query(query, (remark, slno), False)


# ----- API DISPATCH MONITOR -----
@router.get("/api-dispatch-monitor")
def get_api_dispatch(from_date: str = None, to_date: str = None):
    query = """
        SELECT p.slno, dm.alias as device_alias, p.deviceid, p.env_type, p.payload_type, p.targeturl, p.responsestatus, p.remarks,
               TO_CHAR(p.createddate, 'YYYY-MM-DD HH24:MI:SS') as postedon,
               p.payload, p.diagnostics
        FROM tblPostHistory p
        LEFT JOIN tblDeviceMaster dm ON p.deviceid = dm.deviceid
        WHERE p.isdeleted=0 OR p.isdeleted IS NULL
    """
    params = []
    if from_date:
        query += " AND DATE(p.createddate) >= %s"
        params.append(from_date)
    if to_date:
        query += " AND DATE(p.createddate) <= %s"
        params.append(to_date)
        
    query += " ORDER BY p.slno DESC LIMIT 200"
    return execute_query(query, tuple(params))

# ----- CUSTOMERS -----
@router.get("/customers")
def get_customers():
    return execute_query("SELECT slno, customerName, customer_code, details, peoplelimit FROM tblCustomerMaster WHERE isDeleted=0")

@router.post("/customers")
async def add_customer(request: Request):
    payload = await request.json()
    details = json.dumps(payload.get('details', {}))
    sql = "INSERT INTO tblCustomerMaster (customerName, customer_code, details, peoplelimit, createdBy) VALUES (%s, %s, %s, %s, %s) RETURNING slno"
    return execute_query(sql, (payload.get('customerName'), payload.get('customer_code'), details, payload.get('peoplelimit'), payload.get('createdBy', 'Admin')), False)

@router.put("/customers/{slno}")
async def update_customer(slno: int, request: Request):
    payload = await request.json()
    details = json.dumps(payload.get('details', {}))
    sql = "UPDATE tblCustomerMaster SET customerName=%s, customer_code=%s, details=%s::jsonb, peoplelimit=%s WHERE slno=%s"
    return execute_query(sql, (payload.get('customerName'), payload.get('customer_code'), details, payload.get('peoplelimit'), slno), False)

@router.delete("/customers/{slno}")
def delete_customer(slno: int):
    sql = "UPDATE tblCustomerMaster SET isDeleted=1 WHERE slno=%s"
    return execute_query(sql, (slno,), False)

# ----- PARAMETERS -----
@router.get("/parameters")
def get_params():
    return execute_query("SELECT slno, parameterName, param_tag, labelName, color, unit, conversionFactor, valueFactor, inputField, status, datatype, decimalplaces, status_conditions FROM tblParameterMaster WHERE isDeleted=0")

@router.post("/parameters")
async def add_param(request: Request):
    p = await request.json()
    conds = json.dumps(p.get('status_conditions', []))
    sql = "INSERT INTO tblParameterMaster (parameterName, param_tag, labelName, color, unit, conversionFactor, valueFactor, inputField, status, datatype, decimalplaces, status_conditions) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING slno"
    return execute_query(sql, (p.get('parameterName'), p.get('param_tag'), p.get('labelName'), p.get('color'), p.get('unit'), p.get('conversionFactor'), p.get('valueFactor', 'Avg'), p.get('inputField'), p.get('status', 1), p.get('datatype', 'Decimal'), p.get('decimalplaces'), conds), False)

# ----- DEVICES -----
@router.get("/devices")
def get_devices():
    return execute_query("SELECT slno, customer_code, deviceid, alias, location, address, working_hours_json, active, remarks, create_json_file, post_data, sim_no, operator, recharge_cycle FROM tblDeviceMaster WHERE isDeleted=0")

@router.post("/devices")
async def add_device(request: Request):
    p = await request.json()
    whj = json.dumps(p.get('working_hours_json', {}))
    sql = "INSERT INTO tblDeviceMaster (customer_code, deviceid, alias, location, address, working_hours_json, active, remarks, create_json_file, post_data, sim_no, operator, recharge_cycle) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING slno"
    return execute_query(sql, (p.get('customer_code'), p.get('deviceid'), p.get('alias'), p.get('location'), p.get('address'), whj, p.get('active', 1), p.get('remarks'), p.get('create_json_file', False), p.get('post_data', False), p.get('sim_no'), p.get('operator'), p.get('recharge_cycle')), False)

# ----- JSON FORMATTERS -----
@router.get("/formatters")
def get_formatters():
    return execute_query("SELECT slno, name, jsonTemplate, storedProcedureName, type FROM tblJsonFormatter WHERE isDeleted=0")

@router.post("/formatters")
async def add_formatter(request: Request):
    p = await request.json()
    sql = "INSERT INTO tblJsonFormatter (name, jsonTemplate, storedProcedureName, type) VALUES (%s, %s, %s, %s) RETURNING slno"
    return execute_query(sql, (p.get('name'), p.get('jsonTemplate'), p.get('storedProcedureName'), p.get('type')), False)

@router.post("/formatters/test-json")
async def build_test_json(request: Request):
    """On-demand simulator engine mapping real-world outputs against templates."""
    p = await request.json()
    slno = p.get('slno')
    
    if not slno: return {"status": "error", "message": "Missing formatter ID"}
        
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT jsonTemplate, storedProcedureName FROM tblJsonFormatter WHERE slno=%s", (slno,))
            fmt = cursor.fetchone()
            if not fmt: return {"status": "error", "message": "Formatter not found."}
            
            cursor.execute("SELECT deviceid FROM tblMinuteDetails ORDER BY created_at DESC LIMIT 1")
            dev_row = cursor.fetchone()
            if not dev_row: return {"status": "error", "message": "No data found!"}
                
            dev_id = dev_row['deviceid']
            sp_name = fmt.get('storedprocedurename') or fmt.get('storedProcedureName')
            template_str = fmt.get('jsontemplate') or fmt.get('jsonTemplate')
            
            # Extract RAW SQL DB Context first to pass to frontend
            db_context = {}
            if sp_name:
                try:
                    cursor.execute(f"SELECT * FROM {sp_name}(%s)", (dev_id,))
                    result = cursor.fetchone()
                    if result: db_context = dict(result)
                except Exception as db_e:
                    return {"status": "error", "message": f"SP Execution Error: {db_e}"}
            
            # Now run mapping hook via standard pipeline manually
            import json
            data = json.loads(template_str)
            def traverse(obj):
                if isinstance(obj, dict): return {k: traverse(v) for k, v in obj.items()}
                elif isinstance(obj, list): return [traverse(elem) for elem in obj]
                elif isinstance(obj, str):
                    if obj.startswith('#'): return obj[1:]
                    elif obj.startswith('$'):
                        tag_name = obj[1:]
                        val = db_context.get(tag_name)
                        if val is None: val = db_context.get(tag_name.lower())
                        if val is not None:
                            import decimal
                            if isinstance(val, decimal.Decimal):
                                return int(val) if val % 1 == 0 else float(val)
                            return val
                            
                        return f"NOT_FOUND_{tag_name}"
                    return obj
                return obj
                
            res = json.dumps(traverse(data), indent=2, default=str)
            
            # Convert decimal/numeric results safely into string/primitive serializables for React
            safe_context = {k: str(v) for k, v in db_context.items()}
            
            return {"status": "success", "device_used": dev_id, "payload": res, "sql_data": safe_context}
    except Exception as e:
        return {"status": "error", "message": str(e)}
    finally:
        if conn: conn.close()

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

# ----- USER ROLES -----
@router.get("/roles")
def get_roles():
    return execute_query("SELECT slno, role_name, web_permissions, mobile_permissions FROM tbl_user_roles WHERE is_deleted=0")

@router.post("/roles")
async def add_role(request: Request):
    p = await request.json()
    role_name = p.get('role_name')
    web_perm = json.dumps(p.get('web_permissions', {}))
    mob_perm = json.dumps(p.get('mobile_permissions', []))
    
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            # Check unique constraint (case-insensitive)
            cursor.execute("SELECT slno FROM tbl_user_roles WHERE LOWER(role_name)=LOWER(%s) AND is_deleted=0", (role_name,))
            if cursor.fetchone():
                return {"status": "error", "message": "Role name must be unique"}
            
            cursor.execute("INSERT INTO tbl_user_roles (role_name, web_permissions, mobile_permissions) VALUES (%s, %s::jsonb, %s::jsonb) RETURNING slno", (role_name, web_perm, mob_perm))
            conn.commit()
            return {"status": "success"}
    except Exception as e:
        return {"status": "error", "message": str(e)}
    finally:
        if conn: conn.close()

@router.put("/roles/{slno:int}")
async def update_role(slno: int, request: Request):
    p = await request.json()
    role_name = p.get('role_name')
    web_perm = json.dumps(p.get('web_permissions', {}))
    mob_perm = json.dumps(p.get('mobile_permissions', []))
    
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            # Check unique constraint excluding self
            cursor.execute("SELECT slno FROM tbl_user_roles WHERE LOWER(role_name)=LOWER(%s) AND slno != %s AND is_deleted=0", (role_name, slno))
            if cursor.fetchone():
                return {"status": "error", "message": "Role name must be unique"}
            
            cursor.execute("UPDATE tbl_user_roles SET role_name=%s, web_permissions=%s::jsonb, mobile_permissions=%s::jsonb WHERE slno=%s", (role_name, web_perm, mob_perm, slno))
            conn.commit()
            return {"status": "success"}
    except Exception as e:
        return {"status": "error", "message": str(e)}
    finally:
        if conn: conn.close()

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
    return execute_query("SELECT slno, customer_code, scheduledjsonid AS scheduled_json_id, alertjsonid AS alert_json_id, resolvedjsonid AS resolved_json_id, folder_name FROM tblDeviceJsonMapping WHERE isDeleted=0")

@router.post("/json-mapping")
async def add_json_mapping(request: Request):
    p = await request.json()
    cust = p.get('customer_code')
    
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM tblDeviceJsonMapping WHERE customer_code=%s", (cust,))
            cursor.execute("INSERT INTO tblDeviceJsonMapping (customer_code, scheduledjsonid, alertjsonid, resolvedjsonid, folder_name) VALUES (%s, %s, %s, %s, %s)", (cust, p.get('scheduled_json_id'), p.get('alert_json_id'), p.get('resolved_json_id'), p.get('folder_name', '')))
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
    return execute_query("SELECT slno, customer_code, frequency, starting_time, create_local_json, alert_req, alert_freq, post_url_staging, is_staging, post_url_live, is_active, TO_CHAR(last_run, 'YYYY-MM-DD HH24:MI:SS') as last_run FROM tblScheduler WHERE isDeleted=0")

@router.put("/schedulers/{slno}/toggle")
def toggle_scheduler(slno: int):
    return execute_query("UPDATE tblScheduler SET is_active = NOT is_active WHERE slno=%s", (slno,), False)

@router.post("/schedulers")
async def add_scheduler(request: Request):
    p = await request.json()
    p_freqs = json.dumps(p.get('param_alert_freq', {"TVOC": 15, "PCH": 30, "PCD": 60}))
    sql = "INSERT INTO tblScheduler (customer_code, frequency, starting_time, create_local_json, alert_req, alert_freq, post_url_staging, is_staging, post_url_live, param_alert_freq) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING slno"
    return execute_query(sql, (p.get('customer_code'), p.get('frequency'), p.get('starting_time'), p.get('create_local_json', False), p.get('alert_req', False), p.get('alert_freq'), p.get('post_url_staging'), p.get('is_staging', False), p.get('post_url_live'), p_freqs), False)


@router.post("/batch-import")
async def batch_import(request: Request):
    payload = await request.json()
    entity = payload.get('entity') or payload.get('table_name') or payload.get('tableName')
    records = payload.get('records', [])
    
    if not entity:
        return {"status": "error", "message": "Missing target entity/table_name"}
        
    TABLE_WHITELIST = {
        'customers': 'tblCustomerMaster',
        'parameters': 'tblParameterMaster',
        'devices': 'tblDeviceMaster',
        'formatters': 'tblJsonFormatter',
        'pages': 'tblPages',
        'users': 'tblUsers',
        'param-mapping': 'tblDeviceParameterMapping',
        'json-mapping': 'tblDeviceJsonMapping',
        'schedulers': 'tblScheduler',
        'roles': 'tbl_user_roles'
    }
    
    target_table = None
    if entity in TABLE_WHITELIST:
        target_table = TABLE_WHITELIST[entity]
    else:
        for k, v in TABLE_WHITELIST.items():
            if entity.lower() == v.lower():
                target_table = v
                break
                
    if not target_table:
        return {"status": "error", "message": f"Table '{entity}' is not whitelisted for batch import."}
        
    if not isinstance(records, list):
        return {"status": "error", "message": "Records must be a list"}
        
    conn = get_db_connection()
    succeeded = 0
    failed = 0
    details = []
    
    try:
        with conn.cursor() as cursor:
            # 1. Postgres Sequence Synchronization before starting
            try:
                cursor.execute(f"SELECT pg_get_serial_sequence('{target_table.lower()}', 'slno') as seq")
                seq_row = cursor.fetchone()
                seq_name = seq_row['seq'] if seq_row else None
                if seq_name:
                    cursor.execute(f"SELECT setval(%s, COALESCE(MAX(slno), 0) + 1, false) FROM {target_table}", (seq_name,))
                else:
                    seq_name_fallback = f"{target_table.lower()}_slno_seq"
                    cursor.execute(f"SELECT setval('{seq_name_fallback}', COALESCE(MAX(slno), 0) + 1, false) FROM {target_table}")
            except Exception as seq_err:
                log_error("Batch Import Sequence Sync Pre-run", f"Table: {target_table}, Error: {str(seq_err)}")
                
            # 2. Iterate through records one by one with savepoints
            for i, record in enumerate(records):
                if not isinstance(record, dict):
                    failed += 1
                    details.append({
                        "row_index": i,
                        "status": "failed",
                        "remarks": "Record is not a JSON object"
                    })
                    continue
                    
                # Setup SAVEPOINT
                savepoint_name = f"batch_row_sp_{i}"
                try:
                    cursor.execute(f"SAVEPOINT {savepoint_name}")
                    
                    # Prepare columns and values
                    columns = []
                    placeholders = []
                    values = []
                    
                    for col, val in record.items():
                        # Exclude slno if null/0/empty to let Postgres auto-increment
                        if col.lower() == 'slno':
                            if val in (None, 0, "", "0"):
                                continue
                        
                        # Handle JSON columns
                        if isinstance(val, (dict, list)):
                            from psycopg2.extras import Json
                            val = Json(val)
                            
                        columns.append(col)
                        placeholders.append("%s")
                        values.append(val)
                        
                    if not columns:
                        raise ValueError("No valid columns to insert")
                        
                    # Build insert query with RETURNING slno
                    insert_query = f"INSERT INTO {target_table} ({', '.join(columns)}) VALUES ({', '.join(placeholders)}) RETURNING slno"
                    cursor.execute(insert_query, tuple(values))
                    res_row = cursor.fetchone()
                    inserted_id = res_row['slno'] if res_row else None
                    
                    # Release SAVEPOINT on success
                    cursor.execute(f"RELEASE SAVEPOINT {savepoint_name}")
                    succeeded += 1
                    details.append({
                        "row_index": i,
                        "status": "success",
                        "slno": inserted_id
                    })
                except Exception as row_err:
                    # Rollback to SAVEPOINT on failure
                    try:
                        cursor.execute(f"ROLLBACK TO SAVEPOINT {savepoint_name}")
                    except Exception as rollback_err:
                        log_error("Batch Import Rollback Error", str(rollback_err))
                        
                    failed += 1
                    err_msg = str(row_err)
                    log_error(f"Batch Import Row {i} Error", f"Table: {target_table}, Error: {err_msg}")
                    details.append({
                        "row_index": i,
                        "status": "failed",
                        "remarks": err_msg
                    })
            
            # Commit the successfully inserted rows
            conn.commit()
            
            # 3. Post-run sequence synchronization in case explicit IDs were inserted
            try:
                cursor.execute(f"SELECT pg_get_serial_sequence('{target_table.lower()}', 'slno') as seq")
                seq_row = cursor.fetchone()
                seq_name = seq_row['seq'] if seq_row else None
                if seq_name:
                    cursor.execute(f"SELECT setval(%s, COALESCE(MAX(slno), 0) + 1, false) FROM {target_table}", (seq_name,))
                else:
                    seq_name_fallback = f"{target_table.lower()}_slno_seq"
                    cursor.execute(f"SELECT setval('{seq_name_fallback}', COALESCE(MAX(slno), 0) + 1, false) FROM {target_table}")
            except Exception as seq_err:
                log_error("Batch Import Sequence Sync Post-run", f"Table: {target_table}, Error: {str(seq_err)}")
                
        return {
            "status": "success",
            "summary": {
                "total": len(records),
                "succeeded": succeeded,
                "failed": failed
            },
            "details": details
        }
    except Exception as e:
        if conn:
            conn.rollback()
        log_error("Batch Import Master Error", str(e))
        return {"status": "error", "message": f"Global batch import error: {str(e)}"}
    finally:
        if conn:
            conn.close()


# ----- UNIVERSAL EDIT AND DELETE ENDPOINTS -----
@router.delete("/{entity}/{slno:int}")
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
        'schedulers': 'tblScheduler',
        'roles': 'tbl_user_roles'
    }
    if entity not in table_map:
        return {"status": "error", "message": "Invalid entity context"}
    col_name = "is_deleted" if entity == "roles" else "isDeleted"
    return execute_query(f"UPDATE {table_map[entity]} SET {col_name}=1 WHERE slno=%s", (slno,), False)

@router.put("/{entity}/{slno:int}")
async def update_entity(entity: str, slno: int, request: Request):
    p = await request.json()
    if entity == "customers":
        details = json.dumps(p.get('details', {}))
        return execute_query("UPDATE tblCustomerMaster SET customerName=%s, customer_code=%s, details=%s WHERE slno=%s", (p.get('customerName'), p.get('customer_code'), details, slno), False)
    elif entity == "parameters":
        conds = json.dumps(p.get('status_conditions', []))
        return execute_query("UPDATE tblParameterMaster SET parameterName=%s, param_tag=%s, labelName=%s, color=%s, unit=%s, conversionFactor=%s, valueFactor=%s, inputField=%s, status=%s, datatype=%s, decimalplaces=%s, status_conditions=%s WHERE slno=%s", (p.get('parameterName'), p.get('param_tag'), p.get('labelName'), p.get('color'), p.get('unit'), p.get('conversionFactor'), p.get('valueFactor', 'Avg'), p.get('inputField'), p.get('status', 1), p.get('datatype', 'Decimal'), p.get('decimalplaces'), conds, slno), False)
    elif entity == "devices":
        conn = get_db_connection()
        try:
            with conn.cursor() as cursor:
                cursor.execute("SELECT * FROM tblDeviceMaster WHERE slno=%s", (slno,))
                row = cursor.fetchone()
                if not row:
                    return {"status": "error", "message": "Device not found"}
                
                location = p.get('location')
                if location is None or str(location).strip() == "":
                    location = row['location']
                    
                address = p.get('address')
                if address is None or str(address).strip() == "":
                    address = row['address']
                    
                existing_whj = row['working_hours_json']
                if not existing_whj:
                    existing_whj = {}
                elif isinstance(existing_whj, str):
                    try:
                        existing_whj = json.loads(existing_whj)
                    except:
                        existing_whj = {}
                        
                incoming_whj = p.get('working_hours_json', {})
                if incoming_whj:
                    for k, v in incoming_whj.items():
                        # Only update if the incoming value is actually present
                        if v is not None and str(v).strip() != "" and str(v) != "0":
                            existing_whj[k] = v
                            
                whj_str = json.dumps(existing_whj)
                
                cursor.execute(
                    "UPDATE tblDeviceMaster SET customer_code=%s, deviceid=%s, alias=%s, location=%s, address=%s, working_hours_json=%s, active=%s, remarks=%s, create_json_file=%s, post_data=%s, sim_no=%s, operator=%s, recharge_cycle=%s WHERE slno=%s", 
                    (
                        p.get('customer_code', row['customer_code']), 
                        p.get('deviceid', row['deviceid']), 
                        p.get('alias', row['alias']), 
                        location, 
                        address, 
                        whj_str, 
                        p.get('active', row['active']), 
                        p.get('remarks', row['remarks']), 
                        p.get('create_json_file', row.get('create_json_file')), 
                        p.get('post_data', row.get('post_data')), 
                        p.get('sim_no', row.get('sim_no')), 
                        p.get('operator', row.get('operator')), 
                        p.get('recharge_cycle', row.get('recharge_cycle')), 
                        slno
                    )
                )
                conn.commit()
            return {"status": "success", "data": None}
        except Exception as e:
            if conn: conn.rollback()
            import traceback
            err_details = f"Error: {str(e)}\nTraceback: {traceback.format_exc()}"
            return {"status": "error", "message": "Comprehensive Error during Device Update", "details": err_details}
        finally:
            if conn: conn.close()
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
        return execute_query("UPDATE tblDeviceJsonMapping SET customer_code=%s, scheduledjsonid=%s, alertjsonid=%s, resolvedjsonid=%s, folder_name=%s WHERE slno=%s", (p.get('customer_code'), p.get('scheduled_json_id'), p.get('alert_json_id'), p.get('resolved_json_id'), p.get('folder_name', ''), slno), False)
    elif entity == "schedulers":
        p_freqs = json.dumps(p.get('param_alert_freq', {"TVOC": 15, "PCH": 30, "PCD": 60}))
        return execute_query("UPDATE tblScheduler SET customer_code=%s, frequency=%s, starting_time=%s, create_local_json=%s, alert_req=%s, alert_freq=%s, post_url_staging=%s, is_staging=%s, post_url_live=%s, param_alert_freq=%s WHERE slno=%s", (p.get('customer_code'), p.get('frequency'), p.get('starting_time'), p.get('create_local_json', False), p.get('alert_req', False), p.get('alert_freq'), p.get('post_url_staging'), p.get('is_staging', False), p.get('post_url_live'), p_freqs, slno), False)
    
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

@router.get("/pch-logs")
def get_pch_logs(limit: int = 100, from_date: str = None, to_date: str = None):
    query = "SELECT slno, deviceid, timeframe, TO_CHAR(from_datetime, 'YYYY-MM-DD HH24:MI:SS') as from_datetime, TO_CHAR(to_datetime, 'YYYY-MM-DD HH24:MI:SS') as to_datetime, Max_count, Min_count, PchCount, people_count_threshold_limit, isAlertrequired, TO_CHAR(created_on, 'YYYY-MM-DD HH24:MI:SS') as created_on, isJsonCreated, isJSONposted, remarks FROM tbl_pch_alert WHERE 1=1"
    params = []
    
    if from_date:
        query += " AND DATE(created_on) >= %s"
        params.append(from_date)
    if to_date:
        query += " AND DATE(created_on) <= %s"
        params.append(to_date)
        
    query += " ORDER BY slno DESC LIMIT %s"
    params.append(limit)
    
    return execute_query(query, tuple(params))

@router.get("/analytics/stats")
def get_analytics_stats(deviceid: str, from_date: str = None, to_date: str = None):
    import datetime
    
    # Defaults to past 7 days if not provided
    to_dt = datetime.datetime.now()
    if to_date:
        try:
            to_dt = datetime.datetime.strptime(to_date, "%Y-%m-%d").replace(hour=23, minute=59, second=59)
        except ValueError:
            pass
            
    from_dt = to_dt - datetime.timedelta(days=7)
    if from_date:
        try:
            from_dt = datetime.datetime.strptime(from_date, "%Y-%m-%d").replace(hour=0, minute=0, second=0)
        except ValueError:
            pass
            
    days_count = max(1, (to_dt.date() - from_dt.date()).days + 1)
    
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            # 1. Avg People Count snapshot overall (average hourly delta)
            cursor.execute("""
                SELECT COALESCE(AVG(hourly_delta), 0) as val
                FROM (
                    SELECT MAX(CAST(metrics->>'OUT_RAW' AS NUMERIC)) - MIN(CAST(metrics->>'OUT_RAW' AS NUMERIC)) as hourly_delta
                    FROM tblMinuteDetails
                    WHERE deviceid = %s AND (minute_date + minute_time) >= %s AND (minute_date + minute_time) <= %s
                    GROUP BY DATE_TRUNC('hour', minute_date + minute_time)
                ) sub
            """, (deviceid, from_dt, to_dt))
            avg_people_hour = float(cursor.fetchone()['val'])
            
            # 2. Avg People Count per Day (average of daily deltas)
            cursor.execute("""
                SELECT COALESCE(AVG(daily_delta), 0) as val
                FROM (
                    SELECT MAX(CAST(metrics->>'OUT_RAW' AS NUMERIC)) - MIN(CAST(metrics->>'OUT_RAW' AS NUMERIC)) as daily_delta
                    FROM tblMinuteDetails
                    WHERE deviceid = %s AND (minute_date + minute_time) >= %s AND (minute_date + minute_time) <= %s
                    GROUP BY minute_date
                ) sub
            """, (deviceid, from_dt, to_dt))
            avg_people_day = float(cursor.fetchone()['val'])
            
            # 3. PCH Alert average per day (Total PCH alerts divided by days in range)
            cursor.execute("""
                SELECT COUNT(*) as cnt
                FROM tbl_pch_alert
                WHERE deviceid = %s AND isalertrequired = True AND created_on >= %s AND created_on <= %s
            """, (deviceid, from_dt, to_dt))
            total_pch_alerts = cursor.fetchone()['cnt']
            avg_pch_alerts_day = round(total_pch_alerts / days_count, 2)
            
            # 4. TVOC Alert average per day (Total TVOC alerts divided by days in range)
            cursor.execute("""
                SELECT COUNT(*) as cnt
                FROM tblAlertBucketTVOC
                WHERE DeviceId = %s AND CDatetime >= %s AND CDatetime <= %s
            """, (deviceid, from_dt, to_dt))
            total_tvoc_alerts = cursor.fetchone()['cnt']
            avg_tvoc_alerts_day = round(total_tvoc_alerts / days_count, 2)
            
            # 5. Max Hour people count (hourly delta peak) and timestamp
            cursor.execute("""
                SELECT 
                    TO_CHAR(DATE_TRUNC('hour', minute_date + minute_time), 'YYYY-MM-DD HH24:MI:SS') as recorded_on,
                    MAX(CAST(metrics->>'OUT_RAW' AS NUMERIC)) - MIN(CAST(metrics->>'OUT_RAW' AS NUMERIC)) as delta_val
                FROM tblMinuteDetails
                WHERE deviceid = %s AND (minute_date + minute_time) >= %s AND (minute_date + minute_time) <= %s
                GROUP BY DATE_TRUNC('hour', minute_date + minute_time)
                ORDER BY delta_val DESC
                LIMIT 1
            """, (deviceid, from_dt, to_dt))
            row_max_hr = cursor.fetchone()
            max_hour_people = {
                "val": float(row_max_hr['delta_val']) if row_max_hr else 0,
                "recorded_on": row_max_hr['recorded_on'] if row_max_hr else "-"
            }
            
            # 6. Max Day people count (daily delta peak) and date
            cursor.execute("""
                SELECT 
                    TO_CHAR(minute_date, 'YYYY-MM-DD') as recorded_on,
                    MAX(CAST(metrics->>'OUT_RAW' AS NUMERIC)) - MIN(CAST(metrics->>'OUT_RAW' AS NUMERIC)) as delta_val
                FROM tblMinuteDetails
                WHERE deviceid = %s AND (minute_date + minute_time) >= %s AND (minute_date + minute_time) <= %s
                GROUP BY minute_date
                ORDER BY delta_val DESC
                LIMIT 1
            """, (deviceid, from_dt, to_dt))
            row_max_day = cursor.fetchone()
            max_day_people = {
                "val": float(row_max_day['delta_val']) if row_max_day else 0,
                "recorded_on": row_max_day['recorded_on'] if row_max_day else "-"
            }
            
            # 7. Max PCH Alert day and count
            cursor.execute("""
                SELECT 
                    TO_CHAR(DATE(created_on), 'YYYY-MM-DD') as recorded_on,
                    COUNT(*) as val
                FROM tbl_pch_alert
                WHERE deviceid = %s AND isalertrequired = True AND created_on >= %s AND created_on <= %s
                GROUP BY DATE(created_on)
                ORDER BY val DESC
                LIMIT 1
            """, (deviceid, from_dt, to_dt))
            row_max_pch = cursor.fetchone()
            max_pch_alerts = {
                "val": int(row_max_pch['val']) if row_max_pch else 0,
                "recorded_on": row_max_pch['recorded_on'] if row_max_pch else "-"
            }
            
            # 8. Max TVOC Alert day and count
            cursor.execute("""
                SELECT 
                    TO_CHAR(DATE(CDatetime), 'YYYY-MM-DD') as recorded_on,
                    COUNT(*) as val
                FROM tblAlertBucketTVOC
                WHERE DeviceId = %s AND CDatetime >= %s AND CDatetime <= %s
                GROUP BY DATE(CDatetime)
                ORDER BY val DESC
                LIMIT 1
            """, (deviceid, from_dt, to_dt))
            row_max_tvoc = cursor.fetchone()
            max_tvoc_alerts = {
                "val": int(row_max_tvoc['val']) if row_max_tvoc else 0,
                "recorded_on": row_max_tvoc['recorded_on'] if row_max_tvoc else "-"
            }
            
        return {
            "status": "success",
            "data": {
                "avg_people_hour": round(avg_people_hour, 2),
                "avg_people_day": round(avg_people_day, 2),
                "avg_pch_alerts_day": avg_pch_alerts_day,
                "avg_tvoc_alerts_day": avg_tvoc_alerts_day,
                "max_hour_people": max_hour_people,
                "max_day_people": max_day_people,
                "max_pch_alerts": max_pch_alerts,
                "max_tvoc_alerts": max_tvoc_alerts
            }
        }
    except Exception as e:
        log_error("Database (Analytics Stats API)", str(e))
        return {"status": "error", "message": str(e)}
    finally:
        if conn:
            conn.close()

@router.get("/analytics/people-hourly")
def get_analytics_people_hourly(deviceid: str, from_date: str = None, to_date: str = None):
    import datetime
    
    # Defaults to past 7 days if not provided
    to_dt = datetime.datetime.now()
    if to_date:
        try:
            to_dt = datetime.datetime.strptime(to_date, "%Y-%m-%d").replace(hour=23, minute=59, second=59)
        except ValueError:
            pass
            
    from_dt = to_dt - datetime.timedelta(days=7)
    if from_date:
        try:
            from_dt = datetime.datetime.strptime(from_date, "%Y-%m-%d").replace(hour=0, minute=0, second=0)
        except ValueError:
            pass
            
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            # 1. Fetch threshold limit (pch_threshold from working_hours_json in tblDeviceMaster) for this device
            cursor.execute("""
                SELECT working_hours_json
                FROM tblDeviceMaster
                WHERE deviceid = %s
            """, (deviceid,))
            row_device = cursor.fetchone()
            
            threshold_limit = 30  # default fallback
            if row_device and row_device['working_hours_json']:
                import json
                wh_json = row_device['working_hours_json']
                if isinstance(wh_json, str):
                    try:
                        wh_json = json.loads(wh_json)
                    except Exception:
                        wh_json = {}
                if isinstance(wh_json, dict):
                    val = wh_json.get('pch_threshold')
                    if val is not None:
                        threshold_limit = int(val)
            
            # 2. Fetch hour-wise people count (hourly roll deltas)
            cursor.execute("""
                SELECT 
                    TO_CHAR(DATE_TRUNC('hour', minute_date + minute_time), 'YYYY-MM-DD HH24:MI:SS') as hour_time,
                    COALESCE(MAX(CAST(metrics->>'OUT_RAW' AS NUMERIC)) - MIN(CAST(metrics->>'OUT_RAW' AS NUMERIC)), 0) as avg_people
                FROM tblMinuteDetails
                WHERE deviceid = %s AND (minute_date + minute_time) >= %s AND (minute_date + minute_time) <= %s
                GROUP BY DATE_TRUNC('hour', minute_date + minute_time)
                ORDER BY hour_time ASC
            """, (deviceid, from_dt, to_dt))
            rows = cursor.fetchall()
            
            data = []
            for r in rows:
                data.append({
                    "hour_time": r['hour_time'],
                    "avg_people": round(float(r['avg_people']), 2)
                })
                
        return {
            "status": "success",
            "threshold_limit": threshold_limit,
            "data": data
        }
    except Exception as e:
        log_error("Database (Analytics People Hourly API)", str(e))
        return {"status": "error", "message": str(e)}
    finally:
        if conn:
            conn.close()


@router.get("/analytics/enterprise-compare")
def get_enterprise_compare(from_date: str = None, to_date: str = None):
    import datetime
    
    # Defaults to past 7 days if not provided
    to_dt = datetime.datetime.now()
    if to_date:
        try:
            to_dt = datetime.datetime.strptime(to_date, "%Y-%m-%d").replace(hour=23, minute=59, second=59)
        except ValueError:
            pass
            
    from_dt = to_dt - datetime.timedelta(days=7)
    if from_date:
        try:
            from_dt = datetime.datetime.strptime(from_date, "%Y-%m-%d").replace(hour=0, minute=0, second=0)
        except ValueError:
            pass
            
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            # Fetch all customers
            cursor.execute("SELECT customer_code, customerName FROM tblCustomerMaster WHERE isDeleted=0")
            customers = cursor.fetchall()
            
            comparison_data = []
            for cust in customers:
                code = cust['customer_code']
                name = cust['customername']
                
                # Fetch devices for this customer
                cursor.execute("SELECT deviceid FROM tblDeviceMaster WHERE customer_code = %s AND isDeleted=0", (code,))
                devices = cursor.fetchall()
                device_ids = [d['deviceid'] for d in devices]
                
                if not device_ids:
                    comparison_data.append({
                        "customer_code": code,
                        "customer_name": name,
                        "device_count": 0,
                        "avg_people_hour": 0,
                        "avg_people_day": 0,
                        "tvoc_alerts": 0,
                        "pch_alerts": 0,
                        "total_alerts": 0,
                        "avg_solve_time": 0
                    })
                    continue
                
                # Calculate metrics
                # 1. Avg People/Hour
                cursor.execute("""
                    SELECT COALESCE(AVG(hourly_delta), 0) as val
                    FROM (
                        SELECT MAX(CAST(metrics->>'OUT_RAW' AS NUMERIC)) - MIN(CAST(metrics->>'OUT_RAW' AS NUMERIC)) as hourly_delta
                        FROM tblMinuteDetails
                        WHERE deviceid = ANY(%s) AND (minute_date + minute_time) >= %s AND (minute_date + minute_time) <= %s
                        GROUP BY DATE_TRUNC('hour', minute_date + minute_time)
                    ) sub
                """, (device_ids, from_dt, to_dt))
                avg_people_hour = float(cursor.fetchone()['val'])
                
                # 2. Avg People/Day
                cursor.execute("""
                    SELECT COALESCE(AVG(daily_delta), 0) as val
                    FROM (
                        SELECT MAX(CAST(metrics->>'OUT_RAW' AS NUMERIC)) - MIN(CAST(metrics->>'OUT_RAW' AS NUMERIC)) as daily_delta
                        FROM tblMinuteDetails
                        WHERE deviceid = ANY(%s) AND (minute_date + minute_time) >= %s AND (minute_date + minute_time) <= %s
                        GROUP BY minute_date
                    ) sub
                """, (device_ids, from_dt, to_dt))
                avg_people_day = float(cursor.fetchone()['val'])
                
                # 3. PCH Alerts
                cursor.execute("""
                    SELECT COUNT(*) as cnt
                    FROM tbl_pch_alert
                    WHERE deviceid = ANY(%s) AND isalertrequired = True AND created_on >= %s AND created_on <= %s
                """, (device_ids, from_dt, to_dt))
                pch_alerts = cursor.fetchone()['cnt']
                
                # 4. TVOC Alerts
                cursor.execute("""
                    SELECT COUNT(*) as cnt
                    FROM tblAlertBucketTVOC
                    WHERE DeviceId = ANY(%s) AND CDatetime >= %s AND CDatetime <= %s
                """, (device_ids, from_dt, to_dt))
                tvoc_alerts = cursor.fetchone()['cnt']
                
                # 5. Average Solve Time (PCH)
                cursor.execute("""
                    SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (resolvedon - created_on))/60), 0) as avg_mins
                    FROM tbl_pch_alert
                    WHERE deviceid = ANY(%s) AND isresolved = 1 AND resolvedon >= %s AND resolvedon <= %s
                """, (device_ids, from_dt, to_dt))
                pch_solve = float(cursor.fetchone()['avg_mins'])
                
                # 6. Average Solve Time (TVOC)
                cursor.execute("""
                    SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (statuschangedon - CDatetime))/60), 0) as avg_mins
                    FROM tblAlertBucketTVOC
                    WHERE DeviceId = ANY(%s) AND isResolved = 1 AND statuschangedon >= %s AND statuschangedon <= %s
                """, (device_ids, from_dt, to_dt))
                tvoc_solve = float(cursor.fetchone()['avg_mins'])
                
                # Combined resolve stats
                cursor.execute("SELECT COUNT(*) as cnt FROM tbl_pch_alert WHERE deviceid = ANY(%s) AND isresolved = 1 AND resolvedon >= %s AND resolvedon <= %s", (device_ids, from_dt, to_dt))
                pch_resolved_cnt = cursor.fetchone()['cnt']
                
                cursor.execute("SELECT COUNT(*) as cnt FROM tblAlertBucketTVOC WHERE DeviceId = ANY(%s) AND isResolved = 1 AND statuschangedon >= %s AND statuschangedon <= %s", (device_ids, from_dt, to_dt))
                tvoc_resolved_cnt = cursor.fetchone()['cnt']
                
                total_resolved = pch_resolved_cnt + tvoc_resolved_cnt
                total_solve_time = (pch_solve * pch_resolved_cnt) + (tvoc_solve * tvoc_resolved_cnt)
                
                avg_solve_time = round(total_solve_time / total_resolved) if total_resolved > 0 else 0
                
                comparison_data.append({
                    "customer_code": code,
                    "customer_name": name,
                    "device_count": len(device_ids),
                    "avg_people_hour": round(avg_people_hour),
                    "avg_people_day": round(avg_people_day),
                    "tvoc_alerts": tvoc_alerts,
                    "pch_alerts": pch_alerts,
                    "total_alerts": pch_alerts + tvoc_alerts,
                    "avg_solve_time": avg_solve_time
                })
                
        return {
            "status": "success",
            "data": comparison_data
        }
    except Exception as e:
        import traceback
        log_error("Database (Enterprise Compare API)", f"{str(e)}\n{traceback.format_exc()}")
        return {"status": "error", "message": str(e)}
    finally:
        if conn:
            conn.close()


@router.get("/analytics/aqi-trend")
def get_analytics_aqi_trend(deviceid: str, from_date: str = None, to_date: str = None):
    import datetime
    import traceback
    
    # Defaults to past 7 days if not provided
    to_dt = datetime.datetime.now()
    if to_date:
        try:
            to_dt = datetime.datetime.strptime(to_date, "%Y-%m-%d").replace(hour=23, minute=59, second=59)
        except ValueError:
            pass
            
    from_dt = to_dt - datetime.timedelta(days=7)
    if from_date:
        try:
            from_dt = datetime.datetime.strptime(from_date, "%Y-%m-%d").replace(hour=0, minute=0, second=0)
        except ValueError:
            pass
            
    delta_days = (to_dt - from_dt).days
    
    # Dynamic group by and format based on length of date range to fit neatly on mobile portrait views
    if delta_days <= 2:
        # 15-minute averages
        group_by_clause = "date_trunc('hour', minute_date + minute_time) + (EXTRACT(minute FROM minute_time)::int / 15 * 15) * INTERVAL '1 minute'"
        time_format = "YYYY-MM-DD HH24:MI:SS"
    elif delta_days <= 8:
        # Hourly averages
        group_by_clause = "date_trunc('hour', minute_date + minute_time)"
        time_format = "YYYY-MM-DD HH24:MI:SS"
    else:
        # Daily averages
        group_by_clause = "minute_date"
        time_format = "YYYY-MM-DD"
        
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            query = f"""
                SELECT 
                    TO_CHAR({group_by_clause}, '{time_format}') as time_label,
                    ROUND(AVG(CAST(metrics->>'IAQ' AS NUMERIC))) as avg_aqi,
                    ROUND(AVG(CAST(metrics->>'VOC' AS NUMERIC)), 3) as avg_voc
                FROM tblMinuteDetails
                WHERE deviceid = %s 
                  AND (minute_date + minute_time) >= %s 
                  AND (minute_date + minute_time) <= %s
                  AND metrics ? 'IAQ'
                GROUP BY {group_by_clause}
                ORDER BY time_label ASC
            """
            cursor.execute(query, (deviceid, from_dt, to_dt))
            rows = cursor.fetchall()
            
            data = []
            for r in rows:
                data.append({
                    "time_label": r['time_label'],
                    "avg_aqi": int(r['avg_aqi']) if r['avg_aqi'] is not None else 0,
                    "avg_voc": float(r['avg_voc']) if r['avg_voc'] is not None else 0.0
                })
                
        return {
            "status": "success",
            "data": data
        }
    except Exception as e:
        log_error("Database (Analytics AQI Trend API)", f"{str(e)}\n{traceback.format_exc()}")
        return {"status": "error", "message": str(e)}
    finally:
        if conn:
            conn.close()


# ----- JSON MONITOR -----
@router.get("/json-monitor")
def get_json_monitor(from_date: str = None, to_date: str = None, deviceid: str = None):
    query = """
        SELECT p.slno, p.deviceid, dm.alias as device_alias,
               TO_CHAR(p.createddate, 'YYYY-MM-DD HH24:MI:SS') as createdon,
               p.payload, p.diagnostics
        FROM tblPostHistory p
        LEFT JOIN tblDeviceMaster dm ON p.deviceid = dm.deviceid
        WHERE p.payload_type = 'Scheduled'
    """
    params = []
    if from_date:
        query += " AND DATE(p.createddate) >= %s"
        params.append(from_date)
    if to_date:
        query += " AND DATE(p.createddate) <= %s"
        params.append(to_date)
    if deviceid:
        query += " AND p.deviceid = %s"
        params.append(deviceid)
        
    query += " ORDER BY p.slno DESC LIMIT 200"
    
    res = execute_query(query, tuple(params))
    if res.get('status') == 'success' and res.get('data'):
        import re
        conn = get_db_connection()
        try:
            with conn.cursor() as cursor:
                for row in res['data']:
                    try:
                        payload_str = row.get('payload')
                        if not payload_str:
                            continue
                            
                        # Safely parse JSON if it is a string
                        payload = json.loads(payload_str) if isinstance(payload_str, str) else payload_str
                        if not isinstance(payload, dict):
                            continue
                            
                        tvoc = payload.get('tvoc')
                        if isinstance(tvoc, dict):
                            voc = tvoc.get('voc')
                            sh2s = tvoc.get('sh2s')
                            
                            # If voc/sh2s is missing or is 0, let's fetch the actual raw readings dynamically!
                            if voc is None or sh2s is None or (float(voc) == 0.0 and float(sh2s) == 0.0):
                                cursor.execute("""
                                    SELECT revText FROM public.tbldatareceiver 
                                    WHERE deviceid = %s AND receivedon <= %s 
                                    ORDER BY receivedon DESC LIMIT 1
                                """, (row['deviceid'], row['createdon']))
                                rx_row = cursor.fetchone()
                                if rx_row and rx_row.get('revtext'):
                                    revText = rx_row['revtext']
                                    voc_match = re.search(r'VOC:([-0-9.]+)', revText)
                                    sh2s_match = re.search(r'SH2S:([-0-9.]+)', revText)
                                    
                                    computed_voc = float(voc_match.group(1)) if voc_match else 0.0
                                    computed_sh2s = float(sh2s_match.group(1)) if sh2s_match else 0.0
                                    
                                    tvoc_val = float(tvoc.get('value', 0))
                                    tot_sum = computed_voc + computed_sh2s
                                    
                                    if tot_sum > 0 and tvoc_val > 0:
                                        # Scale proportionally to match tvoc_val exactly
                                        ratio = tvoc_val / tot_sum
                                        computed_voc = round(computed_voc * ratio, 2)
                                        computed_sh2s = round(computed_sh2s * ratio, 2)
                                    elif tvoc_val > 0:
                                        computed_voc = round(tvoc_val * 0.6, 2)
                                        computed_sh2s = round(tvoc_val * 0.4, 2)
                                    
                                    tvoc['voc'] = computed_voc
                                    tvoc['sh2s'] = computed_sh2s
                                    
                                    # Update the payload back
                                    row['payload'] = payload
                        elif isinstance(payload, dict) and 'tvoc_max' in payload:
                            # Back-compat if tvoc is a float rather than dict
                            tvoc_val = float(payload.get('tvoc_max', 0))
                            cursor.execute("""
                                SELECT revText FROM public.tbldatareceiver 
                                WHERE deviceid = %s AND receivedon <= %s 
                                ORDER BY receivedon DESC LIMIT 1
                            """, (row['deviceid'], row['createdon']))
                            rx_row = cursor.fetchone()
                            computed_voc = 0.0
                            computed_sh2s = 0.0
                            if rx_row and rx_row.get('revtext'):
                                revText = rx_row['revtext']
                                voc_match = re.search(r'VOC:([-0-9.]+)', revText)
                                sh2s_match = re.search(r'SH2S:([-0-9.]+)', revText)
                                computed_voc = float(voc_match.group(1)) if voc_match else 0.0
                                computed_sh2s = float(sh2s_match.group(1)) if sh2s_match else 0.0
                                
                            tot_sum = computed_voc + computed_sh2s
                            if tot_sum > 0 and tvoc_val > 0:
                                ratio = tvoc_val / tot_sum
                                computed_voc = round(computed_voc * ratio, 2)
                                computed_sh2s = round(computed_sh2s * ratio, 2)
                            elif tvoc_val > 0:
                                computed_voc = round(tvoc_val * 0.6, 2)
                                computed_sh2s = round(tvoc_val * 0.4, 2)
                                
                            payload['tvoc'] = {
                                "value": tvoc_val,
                                "unit": "ppm",
                                "voc": computed_voc,
                                "sh2s": computed_sh2s,
                                "condition": "bad" if tvoc_val > 12.0 else "good"
                            }
                            row['payload'] = payload
                    except Exception as enrich_e:
                        log_error("JSON Monitor Enrichment", str(enrich_e))
        except Exception as db_e:
            log_error("JSON Monitor DB Connect", str(db_e))
        finally:
            if conn:
                conn.close()
                
    return res
