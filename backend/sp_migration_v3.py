import psycopg2
from database import get_db_connection

def migrate():
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            # 1. Add status_conditions tracking bounds column natively
            cursor.execute("ALTER TABLE tblParameterMaster ADD COLUMN IF NOT EXISTS status_conditions JSONB DEFAULT '[]'::JSONB;")
            print("Successfully migrated status_conditions JSONB column to tblParameterMaster.")
        conn.commit()
    except Exception as e:
        print("ERROR:", e)
    finally:
        if conn: conn.close()

if __name__ == '__main__':
    migrate()
