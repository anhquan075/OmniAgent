"""Account-hash derivation for decision-proof ACL."""

from app.services.casper.account import CasperAccountService
from app.services.casper.contract import CasperDecisionContractService


def test_account_hash_from_live_public_key() -> None:
    # Live OmniAgent Testnet secp256k1 key → account-hash from get-account-info.
    pk = "0203a586a9fb99cc0d3addbcfa543ea1539c16e016b60e4a218d440f25f6727fe8fb"
    assert (
        CasperAccountService.account_hash_from_public_key(pk)
        == "9b62ecfba326c1ab3f249b0f39f457d8fcb0bc7f68f59b7357d4667339ee1f04"
    )


def test_normalize_account_hash_accepts_prefix_and_cep18_form() -> None:
    bare = "9b62ecfba326c1ab3f249b0f39f457d8fcb0bc7f68f59b7357d4667339ee1f04"
    assert CasperAccountService.normalize_account_hash(f"account-hash-{bare}") == bare
    assert CasperAccountService.normalize_account_hash(f"00{bare}") == bare
    assert CasperAccountService.normalize_account_hash("account-hash-demo") is None


def test_build_decision_payload_defaults_agent_from_public_key(monkeypatch) -> None:
    monkeypatch.setenv(
        "CASPER_ACCOUNT_PUBLIC_KEY",
        "0203a586a9fb99cc0d3addbcfa543ea1539c16e016b60e4a218d440f25f6727fe8fb",
    )
    from app.core.settings import get_settings

    get_settings.cache_clear()
    payload = CasperDecisionContractService.build_decision_payload(
        {"decisionId": "acl-demo", "action": "haircut", "riskScore": 22}
    )
    assert (
        payload["agentAccountHash"]
        == "9b62ecfba326c1ab3f249b0f39f457d8fcb0bc7f68f59b7357d4667339ee1f04"
    )
    get_settings.cache_clear()
