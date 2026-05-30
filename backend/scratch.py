import json
from database import get_db_connection

conn = get_db_connection()
try:
    with conn.cursor() as cursor:
        cursor.execute("SELECT * FROM sp_get_woloo_schjsoncreator('98:A3:16:D8:46:DC')")
        row = cursor.fetchone()
        if row:
            print("PCH JSON:")
            pch_data = row['pch']
            if isinstance(pch_data, str):
                pch_data = json.loads(pch_data)
            print(json.dumps(pch_data, indent=2))
            
            print("\nDIAGNOSTICS:")
            print(f"  Breach Window: {row['diag_pch_breach_start']} to {row['diag_pch_breach_end']}")
            print(f"  Breach Count Rows: {row['diag_pch_breach_count_rows']}")
        else:
            print("No data found!")
except Exception as e:
    print("Error:", e)
finally:
    conn.close()
