from fastapi.testclient import TestClient

from app.core.settings import get_settings
from app.main import create_app


def test_agent_card_endpoint_returns_public_json(monkeypatch) -> None:
    monkeypatch.setenv("CASPER_DECISION_CONTRACT_HASH", "hash-contract")
    monkeypatch.setenv("CASPER_DECISION_CONTRACT_PACKAGE_HASH", "hash-package")
    get_settings.cache_clear()
    client = TestClient(create_app())

    response = client.get("/.well-known/casper-agent-card.json")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/json")


def test_agent_card_includes_network_and_contract(monkeypatch) -> None:
    monkeypatch.setenv("CASPER_NETWORK", "casper-test")
    monkeypatch.setenv("CASPER_DECISION_CONTRACT_HASH", "hash-contract")
    monkeypatch.setenv("CASPER_DECISION_CONTRACT_PACKAGE_HASH", "hash-package")
    get_settings.cache_clear()
    client = TestClient(create_app())

    card = client.get("/.well-known/casper-agent-card.json").json()

    assert card["name"] == "OmniAgent Casper Collateral Sentinel"
    assert card["network"] == "casper-test"
    assert card["contractHash"] == "hash-contract"
    assert card["contractPackageHash"] == "hash-package"


def test_agent_card_includes_mcp_tools(monkeypatch) -> None:
    monkeypatch.setenv("MCP_ALLOWED_TOOLS", "casper_record_decision,casper_record_readback")
    get_settings.cache_clear()
    client = TestClient(create_app())

    card = client.get("/.well-known/casper-agent-card.json").json()

    assert card["mcpTools"] == ["casper_record_decision", "casper_record_readback"]
    assert "record_decision" in card["capabilities"]
    assert "verify_receipt" in card["capabilities"]


def test_agent_card_includes_loop_config(monkeypatch) -> None:
    monkeypatch.setenv("CASPER_AGENT_LOOP_ENABLED", "true")
    monkeypatch.setenv("CASPER_AGENT_LOOP_INTERVAL_SEC", "15")
    monkeypatch.setenv("CASPER_AGENT_LOOP_DRY_RUN", "true")
    monkeypatch.setenv("CASPER_AGENT_LOOP_AUTO_READBACK", "true")
    get_settings.cache_clear()
    client = TestClient(create_app())

    card = client.get("/.well-known/casper-agent-card.json").json()

    assert card["agentLoop"] == {
        "enabled": True,
        "intervalSec": 15,
        "dryRun": True,
        "autoReadback": True,
    }
