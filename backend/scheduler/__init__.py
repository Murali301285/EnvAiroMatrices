"""
EnvAiroMetrics v2.0 scheduler package.

Split from a single 66KB scheduler.py into focused modules so each job type
(orchestrator, aggregator, alerts, cleanup, DLQ) can evolve independently.

Public API is intentionally small — main.py only needs `start_schedulers`.
The helpers remain importable from `scheduler.common` for anyone who needs
them (e.g. tests, or a future /trigger-job admin endpoint).
"""

from .runner import start_schedulers
from .common import _parse_template, _dispatch_webhook, _get_alias

__all__ = ["start_schedulers", "_parse_template", "_dispatch_webhook", "_get_alias"]
