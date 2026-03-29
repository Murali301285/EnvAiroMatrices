import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

DATABASE_URL_DEFAULT = "postgresql://postgres:convo_user@97.74.92.23:5432/postgres"
DATABASE_URL_TARGET = "postgresql://postgres:convo_user@97.74.92.23:5432/EnvAiroMatrics_V2"

CREATE_TABLES_SQL = [
    # Master Tables
    """CREATE TABLE IF NOT EXISTS tblCustomerMaster (
        slno SERIAL PRIMARY KEY,
        customerName VARCHAR(255) NOT NULL,
        customer_code VARCHAR(50) UNIQUE NOT NULL,
        details JSONB,
        isDeleted SMALLINT DEFAULT 0,
        createdBy VARCHAR(100),
        createdDate TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedBy VARCHAR(100),
        updatedDate TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );""",
    """CREATE TABLE IF NOT EXISTS tblParameterMaster (
        slno SERIAL PRIMARY KEY,
        parameterName VARCHAR(255) NOT NULL,
        param_tag VARCHAR(6) UNIQUE NOT NULL,
        labelName VARCHAR(20),
        color VARCHAR(20),
        unit VARCHAR(20),
        conversionFactor VARCHAR(20),
        inputField VARCHAR(255),
        status SMALLINT DEFAULT 1,
        isDeleted SMALLINT DEFAULT 0,
        createdBy VARCHAR(100),
        createdDate TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedBy VARCHAR(100),
        updatedDate TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );""",
    """CREATE TABLE IF NOT EXISTS tblDeviceMaster (
        slno SERIAL PRIMARY KEY,
        customer_code VARCHAR(50) NOT NULL,
        deviceid VARCHAR(16) NOT NULL,
        alias VARCHAR(20),
        location VARCHAR(20),
        address TEXT,
        working_hours_json JSONB,
        active SMALLINT DEFAULT 1,
        remarks TEXT,
        isDeleted SMALLINT DEFAULT 0,
        createdBy VARCHAR(100),
        createdDate TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedBy VARCHAR(100),
        updatedDate TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (customer_code, deviceid)
    );""",
    """CREATE TABLE IF NOT EXISTS tblDeviceParamMapping (
        slno SERIAL PRIMARY KEY,
        deviceid VARCHAR(16) NOT NULL,
        param_tag VARCHAR(6) NOT NULL,
        api_rev_tag VARCHAR(100) NOT NULL,
        isDeleted SMALLINT DEFAULT 0,
        createdBy VARCHAR(100),
        createdDate TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedBy VARCHAR(100),
        updatedDate TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (deviceid, param_tag)
    );""",
    # Orchestration Tables
    """CREATE TABLE IF NOT EXISTS tblJsonFormatter (
        slno SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        jsonTemplate TEXT,
        storedProcedureName VARCHAR(255),
        type VARCHAR(20) NOT NULL,
        isDeleted SMALLINT DEFAULT 0,
        createdBy VARCHAR(100),
        createdDate TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedBy VARCHAR(100),
        updatedDate TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );""",
    """CREATE TABLE IF NOT EXISTS tblDeviceJsonMapping (
        slno SERIAL PRIMARY KEY,
        deviceid VARCHAR(16) UNIQUE NOT NULL,
        scheduledJsonId INT,
        alertJsonId INT,
        resolvedJsonId INT,
        isDeleted SMALLINT DEFAULT 0,
        createdBy VARCHAR(100),
        createdDate TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedBy VARCHAR(100),
        updatedDate TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );""",
    """CREATE TABLE IF NOT EXISTS tblUsers (
        slno SERIAL PRIMARY KEY,
        firstName VARCHAR(20),
        lastName VARCHAR(20),
        loginId VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        userRole VARCHAR(20) DEFAULT 'User',
        companyCodes JSONB,
        isDeleted SMALLINT DEFAULT 0,
        createdBy VARCHAR(100),
        createdDate TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedBy VARCHAR(100),
        updatedDate TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );""",
    # Ingestion Tables
    """CREATE TABLE IF NOT EXISTS tblDatareceiver (
        slno BIGSERIAL PRIMARY KEY,
        deviceid VARCHAR(16) NOT NULL,
        revText TEXT,
        receivedOn TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        isDeleted SMALLINT DEFAULT 0,
        isProcessed SMALLINT DEFAULT 0,
        processedOn TIMESTAMP
    );""",
    """CREATE INDEX IF NOT EXISTS idx_received_device ON tblDatareceiver (deviceid, receivedOn);""",
    # History Partitioned by Month
    """CREATE TABLE IF NOT EXISTS tblDatareceiverHistory (
        slno BIGINT,
        deviceid VARCHAR(16) NOT NULL,
        revText TEXT,
        receivedOn TIMESTAMP NOT NULL,
        isDeleted SMALLINT DEFAULT 0,
        isProcessed SMALLINT DEFAULT 0,
        processedOn TIMESTAMP
    ) PARTITION BY LIST ( CAST(EXTRACT(MONTH FROM receivedOn) AS INTEGER) );""",
    "CREATE TABLE IF NOT EXISTS th_1 PARTITION OF tblDatareceiverHistory FOR VALUES IN (1);",
    "CREATE TABLE IF NOT EXISTS th_2 PARTITION OF tblDatareceiverHistory FOR VALUES IN (2);",
    "CREATE TABLE IF NOT EXISTS th_3 PARTITION OF tblDatareceiverHistory FOR VALUES IN (3);",
    "CREATE TABLE IF NOT EXISTS th_4 PARTITION OF tblDatareceiverHistory FOR VALUES IN (4);",
    "CREATE TABLE IF NOT EXISTS th_5 PARTITION OF tblDatareceiverHistory FOR VALUES IN (5);",
    "CREATE TABLE IF NOT EXISTS th_6 PARTITION OF tblDatareceiverHistory FOR VALUES IN (6);",
    "CREATE TABLE IF NOT EXISTS th_7 PARTITION OF tblDatareceiverHistory FOR VALUES IN (7);",
    "CREATE TABLE IF NOT EXISTS th_8 PARTITION OF tblDatareceiverHistory FOR VALUES IN (8);",
    "CREATE TABLE IF NOT EXISTS th_9 PARTITION OF tblDatareceiverHistory FOR VALUES IN (9);",
    "CREATE TABLE IF NOT EXISTS th_10 PARTITION OF tblDatareceiverHistory FOR VALUES IN (10);",
    "CREATE TABLE IF NOT EXISTS th_11 PARTITION OF tblDatareceiverHistory FOR VALUES IN (11);",
    "CREATE TABLE IF NOT EXISTS th_12 PARTITION OF tblDatareceiverHistory FOR VALUES IN (12);",
    """CREATE INDEX IF NOT EXISTS idx_history_device_pg ON tblDatareceiverHistory (deviceid, receivedOn);""",
    # Dead Letter Queue
    """CREATE TABLE IF NOT EXISTS tblDeadLetterQueue (
        slno BIGSERIAL PRIMARY KEY,
        deviceid VARCHAR(16),
        payload TEXT,
        targetUrl VARCHAR(500),
        errorReason TEXT,
        retryCount INT DEFAULT 0,
        isDeleted SMALLINT DEFAULT 0,
        createdBy VARCHAR(100),
        createdDate TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedBy VARCHAR(100),
        updatedDate TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );""",
    # Post History
    """CREATE TABLE IF NOT EXISTS tblPostHistory (
        slno BIGSERIAL PRIMARY KEY,
        deviceid VARCHAR(16),
        payload TEXT,
        targetUrl VARCHAR(500),
        responseStatus VARCHAR(50),
        isDeleted SMALLINT DEFAULT 0,
        createdBy VARCHAR(100),
        createdDate TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedBy VARCHAR(100),
        updatedDate TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );"""
]

def init_db():
    print("Initiating PostgreSQL setup...")
    try:
        conn = psycopg2.connect(DATABASE_URL_DEFAULT)
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        with conn.cursor() as cursor:
            cursor.execute("SELECT 1 FROM pg_catalog.pg_database WHERE datname = 'EnvAiroMatrics_V2'")
            exists = cursor.fetchone()
            if not exists:
                cursor.execute('CREATE DATABASE "EnvAiroMatrics_V2"')
                print("Database EnvAiroMatrics_V2 created.")
    except Exception as e:
        print(f"Error creating Database: {e}")
        return
    finally:
        if 'conn' in locals() and conn:
            conn.close()

    try:
        conn = psycopg2.connect(DATABASE_URL_TARGET)
        with conn.cursor() as cursor:
            for sql in CREATE_TABLES_SQL:
                print(f"Executing: {sql[:60]}...")
                cursor.execute(sql)
            conn.commit()
            print("Successfully initialized all PostgreSQL schema tables!")
    except Exception as e:
        print(f"Error creating tables: {e}")
    finally:
        if 'conn' in locals() and conn:
            conn.close()

if __name__ == '__main__':
    init_db()
