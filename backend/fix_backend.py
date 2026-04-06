import psycopg2
from database import get_db_connection

def dedup_and_fix():
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            # Delete physical duplicates across exact identical timestamp intervals
            cursor.execute("""
                DELETE FROM tblScheduledJsonHistory
                WHERE slno NOT IN (
                    SELECT MIN(slno)
                    FROM tblScheduledJsonHistory
                    GROUP BY deviceid, created_at
                )
            """)
            deleted_count = cursor.rowcount
            print(f"Deleted {deleted_count} historic duplicate entries safely!")
            conn.commit()
    except Exception as e:
        print("Error:", e)
    finally:
        if conn: conn.close()

if __name__ == '__main__':
    dedup_and_fix()
