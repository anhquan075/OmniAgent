"""Tests for Cheat Lab intentional vault reverts."""

from pathlib import Path

from fastapi.testclient import TestClient

from app.core.settings import get_settings
from app.main import create_app
from app.services.casper.cheat_lab import CasperCheatLabService
from app.services.casper.cli_output import CasperCliOutput
from app.services.casper.ledger import CasperDecisionLedger
from app.services.casper.public_proof import CasperPublicProofService


def test_cli_output_extracts_user_error_code() -> None:
    output = '{"result":{"execution_info":{"execution_result":{"Version2":{"error_message":"User error: 102"}}}}}'
    assert CasperCliOutput.extract_execution_status(output) == "failed"
    assert CasperCliOutput.extract_error_message(output) == "User error: 102"
    assert CasperCliOutput.extract_user_error_code(output) == 102


def test_cheat_scenarios_cover_user_errors_100_102_103() -> None:
    items = CasperCheatLabService.list_scenarios()
    codes = {item["expectedUserError"] for item in items}
    assert codes == {100, 102, 103}
    assert {item["id"] for item in items} == {
        "malformed_receipt",
        "unapproved_gate",
        "wrong_action",
    }


def test_build_attack_args_shapes(monkeypatch) -> None:
    monkeypatch.setenv("CASPER_VAULT_ASSET_ID", "asset-1")
    get_settings.cache_clear()

    malformed = CasperCheatLabService.build_attack_args("malformed_receipt")
    assert malformed["receipt"] == "not-a-receipt"
    assert malformed["expectedUserError"] == 100

    blocked = CasperCheatLabService.build_attack_args("unapproved_gate")
    assert "|blocked|" in blocked["receipt"]
    assert blocked["expectedUserError"] == 102

    wrong = CasperCheatLabService.build_attack_args("wrong_action")
    assert wrong["receipt"].split("|")[1] == "approve"
    assert wrong["entryPoint"] == "freeze"
    assert wrong["expectedUserError"] == 103


def test_canary_run_returns_ready_hash(monkeypatch, tmp_path: Path) -> None:
    canaries = tmp_path / "cheat-lab-canaries.json"
    canaries.write_text(
        """
        {
          "updatedAt": "2026-07-25T00:00:00+00:00",
          "scenarios": {
            "unapproved_gate": {
              "transactionHash": "%s",
              "explorerUrl": "https://testnet.cspr.live/deploy/%s",
              "errorMessage": "User error: 102",
              "userErrorCode": 102,
              "recordedAt": "2026-07-25T00:00:00+00:00"
            }
          }
        }
        """
        % ("a" * 64, "a" * 64),
        encoding="utf-8",
    )
    monkeypatch.setenv("CASPER_CHEAT_LAB_CANARIES_PATH", str(canaries))
    monkeypatch.setenv("CASPER_EXPLORER_URL", "https://testnet.cspr.live")
    get_settings.cache_clear()

    result = CasperCheatLabService.run_scenario("unapproved_gate", live=False)
    assert result["ok"] is True
    assert result["mode"] == "canary"
    assert result["status"] == "reverted"
    assert result["expectedUserError"] == 102
    assert result["transactionHash"] == "a" * 64
    assert result["explorerUrl"].endswith("/deploy/" + "a" * 64)


def test_public_proof_includes_cheat_reverts(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setenv("CASPER_DECISION_LEDGER_PATH", str(tmp_path / "proof.sqlite3"))
    canaries = tmp_path / "cheat.json"
    canaries.write_text(
        '{"updatedAt":null,"scenarios":{"malformed_receipt":{"transactionHash":"%s","errorMessage":"User error: 100","userErrorCode":100}}}'
        % ("b" * 64),
        encoding="utf-8",
    )
    monkeypatch.setenv("CASPER_CHEAT_LAB_CANARIES_PATH", str(canaries))
    get_settings.cache_clear()
    CasperDecisionLedger.clear_current_log()

    proof = CasperPublicProofService.get_public_proof({})
    assert "cheatReverts" in proof
    assert proof["cheatReverts"]["count"] == 3
    assert proof["cheatReverts"]["readyCount"] == 1
    assert proof["cheatReverts"]["endpoint"] == "/api/public/cheat"


def test_public_cheat_endpoints(monkeypatch, tmp_path: Path) -> None:
    canaries = tmp_path / "cheat.json"
    canaries.write_text(
        '{"updatedAt":null,"scenarios":{"wrong_action":{"transactionHash":"%s","explorerUrl":"https://testnet.cspr.live/deploy/%s","errorMessage":"User error: 103","userErrorCode":103}}}'
        % ("c" * 64, "c" * 64),
        encoding="utf-8",
    )
    monkeypatch.setenv("CASPER_CHEAT_LAB_CANARIES_PATH", str(canaries))
    monkeypatch.setenv("CASPER_DECISION_LEDGER_PATH", str(tmp_path / "ledger.sqlite3"))
    get_settings.cache_clear()
    CasperDecisionLedger.clear_current_log()
    client = TestClient(create_app())

    catalog = client.get("/api/public/cheat")
    assert catalog.status_code == 200
    body = catalog.json()
    assert body["count"] == 3
    assert body["readyCount"] == 1

    run = client.post("/api/public/cheat/wrong_action")
    assert run.status_code == 200
    payload = run.json()
    assert payload["ok"] is True
    assert payload["expectedUserError"] == 103
    assert payload["transactionHash"] == "c" * 64

    missing = client.post("/api/public/cheat/does-not-exist")
    assert missing.status_code == 404
