import os
import bcrypt
import psycopg2

# 1. Update Password
DATABASE_URL = "postgresql://postgres:convo_user@97.74.92.23:5432/EnvAiroMatrics_V2"
conn = psycopg2.connect(DATABASE_URL)
cur = conn.cursor()
new_hash = bcrypt.hashpw(b"Admin$26", bcrypt.gensalt()).decode()
cur.execute("UPDATE tblusers SET password=%s WHERE LOWER(loginid)='admin'", (new_hash,))
conn.commit()
print("Updated database password securely to Admin$26")

# 2. Update Frontend Theming Globally
replacements = {
    'from-sky-500': 'from-emerald-500',
    'to-indigo-500': 'to-teal-600',
    'from-sky-400': 'from-emerald-400',
    'to-indigo-400': 'to-teal-500',
    'bg-purple-600': 'bg-emerald-600',
    'ring-purple-600': 'ring-emerald-600',
    'shadow-purple-600': 'shadow-emerald-600',
    'text-sky-600': 'text-emerald-600',
    'text-sky-700': 'text-emerald-700',
    'bg-sky-50': 'bg-emerald-50',
    'bg-sky-100': 'bg-emerald-100',
    'text-sky-500': 'text-emerald-500',
    'ring-sky-500': 'ring-emerald-500',
    'border-sky-500': 'border-emerald-500',
    'border-sky-100': 'border-emerald-100',
    'shadow-sky-500': 'shadow-emerald-500',
    'text-indigo-600': 'text-teal-600',
    'text-indigo-500': 'text-teal-500',
    'text-indigo-300': 'text-teal-300',
    'bg-indigo-50': 'bg-teal-50',
    'shadow-indigo-500': 'shadow-teal-500',
    'via-indigo-500': 'via-teal-500',
    'to-purple-500': 'to-emerald-700',
    'border-indigo-500': 'border-teal-500',
    'focus:ring-indigo-500': 'focus:ring-emerald-500',
    'focus:border-indigo-500': 'focus:border-emerald-500',
    'hover:shadow-indigo-500': 'hover:shadow-emerald-500'
}

frontend_dir = r"f:\Dev\EnvAiroMetrics v2.0\EnvMat v2\frontend\src"

def process_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    new_content = content
    for old, new in replacements.items():
        new_content = new_content.replace(old, new)
        
    if new_content != content:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Updated theme attributes in {os.path.basename(path)}")
        
for root, _, files in os.walk(frontend_dir):
    for file in files:
        if file.endswith(('.tsx', '.ts')):
            process_file(os.path.join(root, file))

print("Frontend branding successfully synchronized with the emerald/teal specifications!")
