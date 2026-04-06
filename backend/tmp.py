import psycopg2
from database import get_db_connection

conn = get_db_connection()
with conn.cursor() as cursor:
    cursor.execute("SELECT f.jsonTemplate, f.storedProcedureName FROM tblDeviceMaster dm JOIN tblDeviceJsonMapping m ON dm.customer_code = m.customer_code JOIN tblJsonFormatter f ON m.scheduledJsonId = f.slno WHERE dm.deviceid='98:A3:16:D8:46:DC' AND f.type='Scheduled'")
    res = cursor.fetchone()
    print('SP NAME:', res['storedprocedurename'])
    
    # Try calling SP
    try:
        cursor.execute(f"SELECT * FROM {res['storedprocedurename']}('98:A3:16:D8:46:DC')")
        data = cursor.fetchone()
        print('\nSP OUTPUT KEYS:', data.keys())
        if 'pch' in data:
            print('\nSP PCH val:', data['pch'])
        if 'pch_in' in data:
            print('\nSP PCH_IN val:', data['pch_in'])
        else:
            print('NO pch_in key found at top level!')
    except Exception as e:
        print('Error calling SP:', e)
