import os

import pytest


os.environ["OMNIAGENT_SKIP_ENV_FILE"] = "true"
os.environ["API_RATE_LIMIT_ENABLED"] = "false"
os.environ["BNB_BUNDLED_REGISTRATION_PROOF_ENABLED"] = "false"


@pytest.fixture(autouse=True)
def clear_cmc_quota_guard() -> None:
    from app.services.cmc import agent_hub, agent_hub_tools, prices
    from app.services.cmc.quota_guard import CmcQuotaGuard

    CmcQuotaGuard.clear()
    agent_hub._STATUS_CACHE.clear()
    agent_hub_tools._TOOL_CALL_CACHE.clear()
    prices._PRICE_CACHE.clear()
    yield
    CmcQuotaGuard.clear()
    agent_hub._STATUS_CACHE.clear()
    agent_hub_tools._TOOL_CALL_CACHE.clear()
    prices._PRICE_CACHE.clear()
