"""Tests for blocked decision receipts and desk-story proof fields."""

from pathlib import Path

from app.core.settings import get_settings
from app.services.casper.cli_command import CasperCliCommand
from app.services.casper.contract import CasperDecisionContractService
from app.services.casper.ledger import CasperDecisionLedger
from app.services.casper.public_proof import CasperPublicProofService


def test_build_decision_payload_includes_dissent_fields() -> None:
    payload = CasperDecisionContractService.build_decision_payload(
        {
            "decisionId": "reject-1",
            "action": "block",
            "riskScore": 91,
            "policyGate": "blocked",
            "proposerVerdict": "proposed",
            "criticVerdict": "blocked",
            "guardrails": {
                "roles": [
                    {"agentRole": "proposer", "verdict": "proposed"},
                    {"agentRole": "critic", "verdict": "blocked"},
                ],
                "guardrailHash": "sha256:g",
            },
        }
    )
    assert payload["policyGate"] == "blocked"
    assert payload["proposerVerdict"] == "proposed"
    assert payload["criticVerdict"] == "blocked"
    assert payload["dissentDigest"].startswith("sha256:")


def test_session_args_include_dissent_fields() -> None:
    args = CasperCliCommand.session_args(
        {
            "decisionId": "d1",
            "action": "block",
            "proofDigest": "sha256:p",
            "rationaleHash": "sha256:r",
            "sourceHash": "sha256:s",
            "timestamp": "t",
            "riskScore": 90,
            "policyGate": "blocked",
            "agentAccountHash": "ab" * 32,
            "guardrailHash": "sha256:g",
            "proposerVerdict": "proposed",
            "criticVerdict": "blocked",
            "dissentDigest": "sha256:d",
        }
    )
    joined = " ".join(args)
    assert "proposer_verdict:string='proposed'" in joined
    assert "critic_verdict:string='blocked'" in joined
    assert "dissent_digest:string='sha256:d'" in joined


def test_public_proof_desk_story_and_last_blocked(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setenv("CASPER_DECISION_LEDGER_PATH", str(tmp_path / "ledger.sqlite3"))
    monkeypatch.setenv("CASPER_DECISION_ACL_ENABLED", "true")
    monkeypatch.setenv("CASPER_DECISION_AUTHORIZED_AGENT_HASH", "ab" * 32)
    monkeypatch.setenv("CASPER_DECISION_BLOCKED_CANARY_TX_HASH", "c" * 64)
    monkeypatch.setenv("CASPER_DECISION_BLOCKED_DECISION_ID", "desk-reject-1")
    monkeypatch.setenv("CASPER_DECISION_BLOCKED_ENFORCE_REVERT_TX_HASH", "d" * 64)
    monkeypatch.setenv("CASPER_EXPLORER_URL", "https://testnet.cspr.live")
    get_settings.cache_clear()
    CasperDecisionLedger.clear_current_log()

    proof = CasperPublicProofService.get_public_proof({})
    assert proof["authoring"]["lastBlocked"]["decisionId"] == "desk-reject-1"
    assert proof["authoring"]["lastBlocked"]["transactionHash"] == "c" * 64
    assert proof["deskStory"]["count"] == 5
    assert proof["deskStory"]["readyCount"] == 5
    assert proof["deskStory"]["steps"][3]["id"] == "onchain_reject"
    assert proof["deskStory"]["steps"][3]["status"] == "ready"
