import psycopg2

DATABASE_URL = "postgresql://postgres:convo_user@97.74.92.23:5432/EnvAiroMatrics_V2"
conn = psycopg2.connect(DATABASE_URL)
cur = conn.cursor()
cur.execute("SELECT loginid, password FROM tblusers WHERE isdeleted=0 LIMIT 1;")
result = cur.fetchone()
if result:
    print(f"Login ID: {result[0]}")
    print(f"Password: {result[1]}")
else:
    print("No active users found in tblusers.")
