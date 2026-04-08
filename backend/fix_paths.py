import os
import re

def rewrite_file(filepath, operations):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    for old_t, new_t in operations:
        if old_t in content:
            content = content.replace(old_t, new_t)
        else:
            print(f"Warning: Chunk not found in {filepath}:\n{old_t}")

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

base = os.path.dirname(os.path.abspath(__file__))
sched_path = os.path.join(base, 'scheduler.py')
iot_path = os.path.join(base, 'routers', 'iot_receiver.py')

sched_ops = [
    # TVOC Active Alert Fix
    (
        "overrides = {'triggered_by': 'threshold_breach', 'alert_sequence': b_count_before + 1, 'tvoc_bad': diff_mins}",
        "overrides = {'triggered_by': 'threshold_breach', 'alert_sequence': b_count_before, 'tvoc_bad': diff_mins, 'parameters': 'tvoc'}"
    ),
    (
        "f_path = os.path.join(JSON_LOG_DIR, f\"{dev_id.replace(':', '').replace('+', '')}_{safe_dt}_Alert_Tvoc.json\")",
        "target_dir = os.path.join(JSON_LOG_DIR, \"Woloo\", \"Alert\")\n                    os.makedirs(target_dir, exist_ok=True)\n                    f_path = os.path.join(target_dir, f\"{dev_id.replace(':', '').replace('+', '')}_{safe_dt}_Alert_Tvoc.json\")"
    ),
    
    # TVOC Resolved Alert Fix
    (
        "overrides = {'triggered_by': 'threshold_resolved', 'alert_sequence': b.get('count', 0), 'tvoc_bad': diff_mins}",
        "overrides = {'triggered_by': 'threshold_resolved', 'alert_sequence': max(1, b.get('count', 1)), 'tvoc_bad': diff_mins, 'parameters': 'tvoc'}"
    ),
    # Note: wait! TVOC Resolved Alert JSON path is identically matched to TVOC Active Alert JSON path text. So the replacement replaced both!
    # Wait, the replace string for TVOC Active will replace BOTH occurences! But I want different folders!
]
# We cannot do generic Replace since the F_Path text is identical for Active and Resolved. 
# We should use regex.
