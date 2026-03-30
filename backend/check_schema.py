import psycopg2
from database import DATABASE_URL

def alter_schema():
    conn = psycopg2.connect(DATABASE_URL)
    c = conn.cursor()
    c.execute("ALTER TABLE tblparametermaster ADD COLUMN IF NOT EXISTS datatype VARCHAR(50) DEFAULT 'Decimal'")
    c.execute("ALTER TABLE tblparametermaster ADD COLUMN IF NOT EXISTS decimalplaces INT DEFAULT 2")
    conn.commit()
    print("Schema updated successfully.")

alter_schema()
