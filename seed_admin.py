import psycopg2
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
hashed_password = pwd_context.hash("Admin$26")

DATABASE_URL_TARGET = "postgresql://postgres:convo_user@97.74.92.23:5432/EnvAiroMatrics_V2"

def seed_admin():
    conn = psycopg2.connect(DATABASE_URL_TARGET)
    try:
        with conn.cursor() as cursor:
            # We use 'Admin' as loginId, 'Admin' as firstName.
            cursor.execute(
                "INSERT INTO tblUsers (loginId, firstName, password, userRole) VALUES (%s, %s, %s, %s) ON CONFLICT (loginId) DO UPDATE SET password = EXCLUDED.password",
                ('Admin', 'Admin', hashed_password, 'Admin')
            )
            conn.commit()
            print("Successfully seeded Admin user (Admin / Admin$26).")
    except Exception as e:
        print(f"Error seeding admin: {e}")
    finally:
        conn.close()

if __name__ == '__main__':
    seed_admin()
