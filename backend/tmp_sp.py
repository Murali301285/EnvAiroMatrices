from database import get_db_connection
conn = get_db_connection()
cursor = conn.cursor()
cursor.execute("SELECT pg_get_functiondef(oid) as def FROM pg_proc WHERE proname = 'sp_get_woloo_schjsoncreator';")
with open('tmp_sp_output.sql', 'w', encoding='utf-8') as f:
    f.write(cursor.fetchone()['def'])
conn.close()
