import psycopg2
from database import get_db_connection

def fix_db():
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("UPDATE tblScheduler SET is_active = TRUE WHERE is_active IS NULL;")
            print("Successfully updated null values in is_active.")
        conn.commit()
    except Exception as e:
        print("DB Error:", e)
    finally:
        if conn: conn.close()

if __name__ == "__main__":
    fix_db()
