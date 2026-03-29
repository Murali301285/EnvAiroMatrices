import psycopg2
from database import DATABASE_URL
conn = psycopg2.connect(DATABASE_URL)
cur = conn.cursor()
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name ILIKE 'tbldevicejsonmapping'")
for row in cur.fetchall():
    print(row[0])
