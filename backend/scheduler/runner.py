"""
APScheduler runner — registers every periodic job.

Cadences match the spec:
- Scheduled JSON orchestrator + alert evaluator: :14/:29/:44/:59 anchors
- Aggregator: every 1 min (new — was missing from the previous runner)
- TVOC stream + dispatch: every 1 min
- Custom PCH alerts: :14/:29/:44/:59 anchors
- DLQ retry loop: every 2 min
- DB + disk cleanup: nightly
"""
from __future__ import annotations

from apscheduler.schedulers.background import BackgroundScheduler

from .aggregator import aggregate_minute_data
from .alerts import evaluate_active_alerts
from .alerts_pch_custom import evaluate_custom_pch_alerts
from .alerts_tvoc import dispatch_tvoc_alerts_job, evaluate_tvoc_bucket_stream
from .cleanup import db_cleanup_job, disk_cleanup_job
from .dlq import process_dlq
from .orchestrator import orchestrate_json_payloads


def start_schedulers() -> BackgroundScheduler:
    """Build, start, and return the BackgroundScheduler with all jobs registered."""
    scheduler = BackgroundScheduler()

    # --- Core pipeline ---
    scheduler.add_job(
        aggregate_minute_data, "interval", minutes=1, id="aggregate_minute_data"
    )
    scheduler.add_job(
        orchestrate_json_payloads,
        "cron",
        minute="14,29,44,59",
        id="orchestrate_json_payloads",
    )

    # --- Alert evaluators ---
    scheduler.add_job(
        evaluate_active_alerts,
        "cron",
        minute="14,29,44,59",
        id="evaluate_active_alerts",
    )
    scheduler.add_job(
        evaluate_custom_pch_alerts,
        "cron",
        minute="14,29,44,59",
        id="evaluate_custom_pch_alerts",
    )
    scheduler.add_job(
        evaluate_tvoc_bucket_stream,
        "interval",
        minutes=1,
        id="evaluate_tvoc_bucket_stream",
    )

    # --- Alert dispatchers ---
    scheduler.add_job(
        dispatch_tvoc_alerts_job, "interval", minutes=1, id="dispatch_tvoc_alerts_job"
    )

    # --- Reliability & maintenance ---
    scheduler.add_job(process_dlq, "interval", minutes=2, id="process_dlq")
    scheduler.add_job(db_cleanup_job, "cron", hour=0, minute=0, id="db_cleanup_job")
    scheduler.add_job(
        disk_cleanup_job, "cron", hour=0, minute=5, id="disk_cleanup_job"
    )

    scheduler.start()
    return scheduler
