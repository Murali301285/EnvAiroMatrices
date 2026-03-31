import glob
import re

files = glob.glob(r'src/**/*.tsx', recursive=True)
count = 0

for f in files:
    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
        
    if 'http://localhost:8381' in content:
        # 1. Replace single-quoted plain strings
        content = re.sub(
            r"'http://localhost:8381([^']*)'",
            r"`http://${window.location.hostname}:8381\1`",
            content
        )
        
        # 2. Replace double-quoted plain strings
        content = re.sub(
            r'"http://localhost:8381([^"]*)"',
            r"`http://${window.location.hostname}:8381\1`",
            content
        )
        
        # 3. Handle instances already within backticks
        content = content.replace('http://localhost:8381', 'http://${window.location.hostname}:8381')
        
        with open(f, 'w', encoding='utf-8') as file:
            file.write(content)
        print(f"Updated {f}")
        count += 1

print(f"Successfully migrated {count} files to dynamic hostname parameters mapping.")
