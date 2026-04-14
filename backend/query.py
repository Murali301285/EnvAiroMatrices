import psycopg2

conn = psycopg2.connect("dbname=PromMS2_2026 user=postgres password=root host=localhost")
cur = conn.cursor()
cur.execute("SELECT jsontemplate FROM tbljsonformatter WHERE name='woloo_scheduled_json' LIMIT 1")
row = cur.fetchone()
print(row[0] if row else "Not found")
conn.close()
