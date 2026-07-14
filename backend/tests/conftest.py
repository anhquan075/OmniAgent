import os

import pytest

from app.core.settings import get_settings


os.environ["OMNIAGENT_SKIP_ENV_FILE"] = "true"
os.environ["API_RATE_LIMIT_ENABLED"] = "false"
os.environ["CASPER_AGENT_LOOP_ENABLED"] = "false"


@pytest.fixture(autouse=True)
def clear_settings_cache() -> None:
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()
