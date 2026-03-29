from fastapi import APIRouter, Request, Depends
from database import get_db_connection
from auth import verify_iot_secret
from ws_manager import manager
import json

router = APIRouter(prefix="/api/v1", tags=["IoT Receiver"])

@router.post("/receiver", dependencies=[Depends(verify_iot_secret)])
async def receive_iot_data(request: Request):
    try:
        data = await request.json()
    except Exception:
        data = dict(request.query_params)
        if not data:
            form = await request.form()
            data = dict(form)

    device_id = data.get("deviceid", data.get("deviceId"))
    rev_text = data.get("revText", data.get("revtext"))
    
    if not device_id or not rev_text:
        return "-1 Error: Missing deviceid or revText"

    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            # Validate deviceid exists in tblDeviceMaster
            cursor.execute("SELECT slno FROM tblDeviceMaster WHERE deviceid=%s AND isDeleted=0", (device_id,))
            if not cursor.fetchone():
                return "-1 Error: Unregistered Device"

            # Insert into main table with RETURNING statement for ID
            cursor.execute("INSERT INTO tblDatareceiver (deviceid, revText) VALUES (%s, %s) RETURNING slno", (device_id, rev_text))
            last_id_row = cursor.fetchone()
            last_id = last_id_row['slno']
            
            # Insert into history table
            cursor.execute("INSERT INTO tblDatareceiverHistory (slno, deviceid, revText, receivedOn) VALUES (%s, %s, %s, NOW())", (last_id, device_id, rev_text))
            
        conn.commit()
        
        # Broadcast via websocket
        await manager.broadcast(json.dumps({"event": "new_data", "deviceid": device_id, "data": rev_text}))
        return "OK"
    except Exception as e:
        print(f"DB Error: {e}")
        return "-1 Error"
    finally:
        if conn:
            conn.close()
