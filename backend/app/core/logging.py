import logging
import os
import sys

import structlog


def get_logger(name: str | None = None) -> structlog.stdlib.BoundLogger:
    return structlog.get_logger(name)


def configure_logging() -> None:
    level = os.getenv("OMNIAGENT_LOG_LEVEL", "INFO").upper()
    json_logs = os.getenv("OMNIAGENT_LOG_JSON", "true").lower() not in {"0", "false", "no"}
    stream_name = os.getenv("OMNIAGENT_LOG_STREAM", "stdout").lower()
    stream = sys.stderr if stream_name == "stderr" else sys.stdout
    timestamper = structlog.processors.TimeStamper(fmt="iso", utc=True)
    shared_processors = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        timestamper,
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]
    renderer = structlog.processors.JSONRenderer() if json_logs else structlog.dev.ConsoleRenderer()
    formatter = structlog.stdlib.ProcessorFormatter(
        processor=renderer,
        foreign_pre_chain=shared_processors,
    )
    handler = logging.StreamHandler(stream)
    handler.setFormatter(formatter)
    logging.basicConfig(handlers=[handler], level=level, force=True)
    structlog.configure(
        processors=[*shared_processors, structlog.stdlib.ProcessorFormatter.wrap_for_formatter],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=False,
    )
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access", "fastapi"):
        logging.getLogger(name).handlers.clear()
        logging.getLogger(name).propagate = True
