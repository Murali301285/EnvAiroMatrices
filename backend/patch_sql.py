from database import get_db_connection

def run_patch():
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("ALTER TABLE tblScheduledJsonHistory ADD COLUMN payload_type VARCHAR(50) DEFAULT 'Scheduled'")
            conn.commit()
            print("Successfully added payload_type to tblScheduledJsonHistory")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        if conn:
            conn.close()

if __name__ == '__main__':
    run_patch()
