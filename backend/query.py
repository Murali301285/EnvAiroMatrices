from database import get_db_connection
conn = get_db_connection()
cur = conn.cursor()
try:
    cur.execute("SELECT datetime, startdtime, pch_value, pch, is_pch_alert FROM public.sp_get_woloo_schjsoncreator('98:A3:16:D8:46:DC', '2026-05-11 19:45:00')")
    print(cur.fetchone())
except Exception as e:
    print(f"ERROR: {e}")
