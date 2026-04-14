from database import get_db_connection
conn = get_db_connection()
with conn.cursor() as cursor:
    cursor.execute("SELECT * FROM tbldatareceiverhistory ORDER BY slno DESC LIMIT 5;")
    for row in cursor.fetchall():
        print(dict(row))
conn.close()
