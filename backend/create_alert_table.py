import psycopg2
from database import get_db_connection

def migrate():
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS tblAlertScheduler (
                slno SERIAL PRIMARY KEY,
                Deviceid VARCHAR(255) NOT NULL,
                param_tag VARCHAR(255),
                Createdon TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                AlertSequence INT DEFAULT 0,
                LastRunOn TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                consucutive_minutes INT DEFAULT 0,
                isResolved INT DEFAULT 0,
                ResolvedOn TIMESTAMP,
                Time_taken INT
            );
            """)
            print("Successfully created tblAlertScheduler!")
        conn.commit()
    except Exception as e:
        print("ERROR:", e)
    finally:
        if conn: conn.close()

if __name__ == '__main__':
    migrate()
