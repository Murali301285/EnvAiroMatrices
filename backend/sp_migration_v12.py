import psycopg2
from database import get_db_connection

def migrate():
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            # 1. Create ApiAccessLogs table
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS tblApiAccessLogs (
                slno SERIAL PRIMARY KEY,
                apiname VARCHAR(255) NOT NULL,
                source VARCHAR(255),
                accessedon TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                params JSONB,
                status VARCHAR(50),
                remarks TEXT
            );
            """)

            # 2. Alter CustomerMaster to add peoplelimit safely
            cursor.execute("""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 
                    FROM information_schema.columns 
                    WHERE table_name='tblcustomermaster' AND column_name='peoplelimit'
                ) THEN
                    ALTER TABLE tblCustomerMaster ADD COLUMN peoplelimit INTEGER DEFAULT NULL;
                END IF;
            END $$;
            """)

            print("Migration V12 Applied: Api Access Logs Engine & Customer People Limit extensions built natively.")
        
        conn.commit()
    except Exception as e:
        print("MIGRATION ERROR:", e)
    finally:
        if conn: conn.close()

if __name__ == '__main__':
    migrate()
