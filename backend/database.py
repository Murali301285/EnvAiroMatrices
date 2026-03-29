import psycopg2
from psycopg2.extras import RealDictCursor

DATABASE_URL = "postgresql://postgres:convo_user@97.74.92.23:5432/EnvAiroMatrics_V2"

def get_db_connection():
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)
