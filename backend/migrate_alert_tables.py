from database import get_db_connection

def migrate():
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            # 1. Create tblAlertMonitor
            print("Creating tblAlertMonitor...")
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS tblAlertMonitor (
                    slno SERIAL PRIMARY KEY,
                    deviceid VARCHAR(100) NOT NULL,
                    param_tag VARCHAR(50) NOT NULL,
                    sequence_count INTEGER DEFAULT 0,
                    last_checked_on TIMESTAMP NOT NULL,
                    created_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    is_resolved BOOLEAN DEFAULT FALSE,
                    resolved_on TIMESTAMP
                );
            """)
            
            # 2. Alter tblScheduler
            print("Altering tblScheduler to add param_alert_freq...")
            try:
                cursor.execute("""
                    ALTER TABLE tblScheduler ADD COLUMN IF NOT EXISTS param_alert_freq JSONB DEFAULT '{"TVOC": 15, "PCH": 30, "PCD": 60}'::jsonb;
                """)
            except Exception as e:
                print(f"Alter Table Error (may already exist): {e}")

            conn.commit()
            print("Migration Successful!")
    except Exception as e:
        print(f"Global Error: {e}")
        if conn: conn.rollback()
    finally:
        if conn: conn.close()

if __name__ == '__main__':
    migrate()
