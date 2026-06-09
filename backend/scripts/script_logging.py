from __future__ import annotations

import os

from app.core.logging import configure_logging, get_logger


def configure_script_logging() -> None:
    os.environ.setdefault("OMNIAGENT_LOG_JSON", "false")
    os.environ.setdefault("OMNIAGENT_LOG_STREAM", "stderr")
    configure_logging()


def get_script_logger(name: str | None = None):
    return get_logger(name)
