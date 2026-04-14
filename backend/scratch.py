import json
from database import get_db_connection
from scheduler import _parse_template

conn = get_db_connection()
cursor = conn.cursor()
cursor.execute("SELECT storedprocedurename FROM tbljsonformatter WHERE name='woloo_scheduled_json' AND isdeleted=0 LIMIT 1")
formatter = cursor.fetchone()
sp_name = formatter['storedprocedurename']

template = json.dumps({"client_id": "Silotech", "device_id": "98:A3:16:D8:46:DC", "node_name": "$node_name"})

print(_parse_template(template, sp_name, '98:A3:16:D8:46:DC', {'alert_sequence': 1}))
