import psycopg2
from database import get_db_connection

def migrate():
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            # 1. Delete redundant minute duplicates (keeping the earliest one safely)
            cursor.execute("""
                DELETE FROM tblMinuteDetails 
                WHERE slno NOT IN (
                    SELECT MIN(slno) 
                    FROM tblMinuteDetails 
                    GROUP BY deviceid, minute_date, minute_time
                );
            """)
            print("Successfully explicitly dropped redundant overlapping payload duplications from tblMinuteDetails.")
            
            # 2. Add structural UNIQUE constraint mapping natively safely
            cursor.execute("""
                ALTER TABLE tblMinuteDetails 
                ADD CONSTRAINT unique_minute UNIQUE (deviceid, minute_date, minute_time);
            """)
            print("Successfully injected UNIQUE constraint on (deviceid, minute_date, minute_time).")
            
        conn.commit()
    except Exception as e:
        print("ERROR:", e)
    finally:
        if conn: conn.close()

if __name__ == '__main__':
    migrate()
