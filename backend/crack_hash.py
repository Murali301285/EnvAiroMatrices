import bcrypt

hash_str = b"$2b$12$iXS9WTCTKPGNEDSR9XebueDvohy38.JBjKMsM9LdA42fv/Ia2Y92y"

passwords = ["admin", "admin123", "password", "123456", "admin@123", "Admin123"]
found = False
for p in passwords:
    if bcrypt.checkpw(p.encode(), hash_str):
        print(f"MATCH FOUND: {p}")
        found = True
        break

if not found:
    print("No match found. Updating DB to 'admin123'...")
    import psycopg2
    DATABASE_URL = "postgresql://postgres:convo_user@97.74.92.23:5432/EnvAiroMatrics_V2"
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    new_hash = bcrypt.hashpw(b"admin123", bcrypt.gensalt()).decode()
    cur.execute("UPDATE tblusers SET password=%s WHERE loginid='Admin'", (new_hash,))
    conn.commit()
    print("Updated admin password to 'admin123'.")
