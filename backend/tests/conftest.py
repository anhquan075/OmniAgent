import os

import pytest


os.environ["OMNIAGENT_SKIP_ENV_FILE"] = "true"
os.environ["API_RATE_LIMIT_ENABLED"] = "false"
os.environ["BNB_BUNDLED_REGISTRATION_PROOF_ENABLED"] = "false"


@pytest.fixture(autouse=True)
def clear_cmc_quota_guard() -> None:
    from app.services.cmc.quota_guard import CmcQuotaGuard

    CmcQuotaGuard.clear()
    yield
    CmcQuotaGuard.clear()
