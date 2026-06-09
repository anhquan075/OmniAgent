import logging
import os
import sys

from loguru import logger


class InterceptHandler(logging.Handler):
    def emit(self, record: logging.LogRecord) -> None:
        try:
            level: str | int = logger.level(record.levelname).name
        except ValueError:
            level = record.levelno
        frame, depth = logging.currentframe(), 0
        while frame:
            module = frame.f_globals.get("__name__", "")
            if module != __name__ and not module.startswith("logging"):
                break
            frame = frame.f_back
            depth += 1
        logger.opt(depth=depth, exception=record.exc_info).log(level, record.getMessage())


def configure_logging() -> None:
    level = os.getenv("OMNIAGENT_LOG_LEVEL", "INFO").upper()
    json_logs = os.getenv("OMNIAGENT_LOG_JSON", "true").lower() not in {"0", "false", "no"}
    logger.remove()
    sink_options = {
        "level": level,
        "backtrace": False,
        "diagnose": False,
        "serialize": json_logs,
    }
    if not json_logs:
        sink_options["format"] = "{time:YYYY-MM-DD HH:mm:ss.SSS} | {level:<8} | {name}:{function}:{line} - {message}"
    logger.add(sys.stderr, **sink_options)
    logging.basicConfig(handlers=[InterceptHandler()], level=0, force=True)
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access", "fastapi"):
        logging.getLogger(name).handlers.clear()
        logging.getLogger(name).propagate = True
