import psycopg2
import os
from database import get_db_connection

def deploy_sp():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    sp_path = os.path.join(base_dir, 'sp_out_utf8.sql')
    
    print(f"Deploying SP from {sp_path}")
    with open(sp_path, 'r', encoding='utf-8') as f:
        sql = f.read()

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(sql)
            conn.commit()
            print("Successfully deployed sp_get_woloo_schjsoncreator!")
    except Exception as e:
        print("Error deploying SP:", e)
        conn.rollback()
    finally:
        conn.close()

if __name__ == '__main__':
    deploy_sp()
