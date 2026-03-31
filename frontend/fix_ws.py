import glob
import re

files = glob.glob(r'src/**/*.tsx', recursive=True)
count = 0

for f in files:
    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
        
    if 'ws://localhost:8381' in content:
        # Replace single-quoted plain strings
        content = re.sub(
            r"'ws://localhost:8381([^']*)'",
            r"`ws://${window.location.hostname}:8381\1`",
            content
        )
        
        # Replace double-quoted plain strings
        content = re.sub(
            r'"ws://localhost:8381([^"]*)"',
            r"`ws://${window.location.hostname}:8381\1`",
            content
        )
        
        # Handle instances already within backticks
        content = content.replace('ws://localhost:8381', 'ws://${window.location.hostname}:8381')
        
        with open(f, 'w', encoding='utf-8') as file:
            file.write(content)
        print(f"Updated {f}")
        count += 1

print(f"Successfully migrated {count} files for WebSocket dynamic connections.")
