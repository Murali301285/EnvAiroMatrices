import psycopg2
from database import get_db_connection

def migrate_tblscheduler():
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            # Check and add is_active column
            cursor.execute("""
                ALTER TABLE tblScheduler 
                ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
            """)
            print("Successfully ensured 'is_active' column exists.")

            # Check and add last_run column
            cursor.execute("""
                ALTER TABLE tblScheduler 
                ADD COLUMN IF NOT EXISTS last_run TIMESTAMP NULL;
            """)
            print("Successfully ensured 'last_run' column exists.")

        conn.commit()
    except Exception as e:
        print("Migration Error:", e)
    finally:
        if conn: conn.close()

if __name__ == "__main__":
    migrate_tblscheduler()
