from database import get_db_connection

def create_table():
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
            CREATE TABLE IF NOT EXISTS tbl_pch_alert (
                slno SERIAL PRIMARY KEY,
                deviceid VARCHAR(100),
                timeframe INT,
                from_datetime TIMESTAMP,
                to_datetime TIMESTAMP,
                Max_count INT,
                Min_count INT,
                PchCount INT,
                people_count_threshold_limit INT,
                isAlertrequired BOOLEAN,
                created_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                isJsonCreated BOOLEAN DEFAULT FALSE,
                isJSONposted BOOLEAN DEFAULT FALSE,
                remarks TEXT
            )
            """)
        conn.commit()
        print("Table tbl_pch_alert created successfully.")
    except Exception as e:
        print("Error:", e)
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    create_table()
