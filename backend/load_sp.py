from database import get_db_connection

def update_sp():
    conn = get_db_connection()
    try:
        with open('sp_out_utf8.sql', 'r', encoding='utf-8') as f:
            sql = f.read()
        
        with conn.cursor() as cursor:
            # Safely drop the existing schema sequence manually so that parameter output modifications strictly apply.
            cursor.execute("DROP FUNCTION IF EXISTS public.sp_get_woloo_schjsoncreator(character varying);")
            cursor.execute(sql)
        conn.commit()
        print("Successfully updated Stored Procedure!")
    except Exception as e:
        print(f"Error: {e}")
        if conn: conn.rollback()
    finally:
        if conn:
            conn.close()

if __name__ == '__main__':
    update_sp()
