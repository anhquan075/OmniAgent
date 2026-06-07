from __future__ import annotations

import sys

from loguru import logger


def configure_script_logging() -> None:
    logger.remove()
    logger.add(
        sys.stderr,
        colorize=True,
        format="<green>{time:HH:mm:ss}</green> | <level>{level}</level> | {message}",
    )
