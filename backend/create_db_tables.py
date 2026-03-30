import psycopg2
from database import DATABASE_URL

commands = (
    """
    CREATE TABLE IF NOT EXISTS tblPages (
        slno SERIAL PRIMARY KEY,
        PageName VARCHAR(255) NOT NULL,
        Path VARCHAR(255) NOT NULL,
        Description TEXT,
        isDeleted INT DEFAULT 0
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS tblUsers (
        slno SERIAL PRIMARY KEY,
        First_Name VARCHAR(20) NOT NULL,
        Last_Name VARCHAR(20),
        LoginId VARCHAR(255) UNIQUE NOT NULL,
        Password VARCHAR(255) NOT NULL,
        User_role VARCHAR(50) NOT NULL,
        Company JSONB,
        isDeleted INT DEFAULT 0
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS tblDeviceParameterMapping (
        slno SERIAL PRIMARY KEY,
        deviceid VARCHAR(20) NOT NULL,
        parameter_id INT NOT NULL,
        api_rev_tag VARCHAR(255),
        isDeleted INT DEFAULT 0
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS tblDeviceJsonMapping (
        slno SERIAL PRIMARY KEY,
        deviceid VARCHAR(20) NOT NULL,
        scheduled_json_id INT,
        alert_json_id INT,
        resolved_json_id INT,
        isDeleted INT DEFAULT 0
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS tblScheduler (
        slno SERIAL PRIMARY KEY,
        deviceid VARCHAR(20) NOT NULL,
        frequency INT NOT NULL,
        starting_time TIME,
        create_local_json BOOLEAN DEFAULT FALSE,
        alert_req BOOLEAN DEFAULT FALSE,
        alert_freq INT,
        post_url_staging VARCHAR(255),
        is_staging BOOLEAN DEFAULT FALSE,
        post_url_live VARCHAR(255),
        isDeleted INT DEFAULT 0
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS tblMinuteDetails (
        slno SERIAL PRIMARY KEY,
        deviceid VARCHAR(50) NOT NULL,
        minute_date DATE NOT NULL,
        minute_time TIME NOT NULL,
        metrics JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """
)

def create_tables():
    conn = None
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor()
        for command in commands:
            cur.execute(command)
        cur.close()
        conn.commit()
        print("SQL missing tables created successfully")
    except (Exception, psycopg2.DatabaseError) as error:
        print(error)
    finally:
        if conn is not None:
            conn.close()

if __name__ == '__main__':
    create_tables()
