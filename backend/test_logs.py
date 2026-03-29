import sys, os
sys.path.insert(0, r"f:\Dev\EnvAiroMetrics v2.0\EnvMat v2\backend")
from logger import log_error, log_event

log_error("API Core", "Simulated trace: DB connection pool exhausted during high load.")
log_error("Scheduler Engine", "Task deadlock detected while syncing local JSON instances.")
log_event("System Orchestrator -> Backend telemetry framework successfully initialized.")
log_event("Deviceid 98:A3:16:D8:46:D -> posted the data successfully")
log_event("Deviceid 00:1A:2B:3C:4D:5E -> resolution status parsed")
log_event("Cron Service -> json old files cleared successfully")
