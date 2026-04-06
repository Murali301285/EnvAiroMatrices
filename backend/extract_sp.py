from database import get_db_connection

def extract_sp():
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT pg_get_functiondef('sp_get_woloo_schjsoncreator'::regproc)")
            result = cursor.fetchone()
            if result:
                with open('sp_out_utf8.sql', 'w', encoding='utf-8') as f:
                    f.write(result['pg_get_functiondef'])
            else:
                print('Not found')
    except Exception as e:
        print(f"Error: {e}")
    finally:
        if conn:
            conn.close()

if __name__ == '__main__':
    extract_sp()
