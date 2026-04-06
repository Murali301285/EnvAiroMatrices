import psycopg2
from database import get_db_connection

def check():
    conn = get_db_connection()
    with conn.cursor() as cursor:
        cursor.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'tblscheduledjsonhistory';")
        for row in cursor.fetchall():
            print(row)
    conn.close()

check()
