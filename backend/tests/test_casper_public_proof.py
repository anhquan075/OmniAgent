from fastapi.testclient import TestClient
import pytest

from app.core.settings import get_settings
from app.main import create_app
from app.services.casper.ledger import CasperDecisionLedger
from app.services.casper.public_proof import CasperPublicProofService


def _decision_event(decision_id: str = "public-proof-001") -> dict[str, object]:
    return {
        "eventType": "casper_decision_submitted",
        "payload": {
            "decision": {
                "decisionId": decision_id,
                "action": "haircut",
                "riskScore": 72,
                "timestamp": "2026-07-03T14:42:00+00:00",
                "proofDigest": "sha256:" + "a" * 64,
                "sourceHash": "sha256:" + "b" * 64,
                "guardrailHash": "sha256:" + "c" * 64,
                "policyGate": "approved",
                "deployHash": "d" * 64,
                "explorerUrl": "https://testnet.cspr.live/deploy/" + "d" * 64,
                "decisionReceipt": {"receiptValue": "public-proof-001|haircut|72"},
                "evidenceBundle": {
                    "sourceHash": "sha256:" + "b" * 64,
                    "evidenceGraph": {
                        "scenario": "rwa-collateral-nav-risk-receipt",
                        "graphDigest": "sha256:" + "2" * 64,
                        "sourceCount": 1,
                        "observedSourceCount": 1,
                        "staleSourceCount": 0,
                        "missingSourceCount": 0,
                    },
                },
                "policyTemplate": {
                    "id": "rwa-collateral-v1",
                    "label": "RWA collateral financing gate",
                    "templateHash": "sha256:" + "3" * 64,
                },
                "x402": {
                    "status": "verified",
                    "receipt": {
                        "receiptId": "x402-1",
                        "provider": "x402",
                        "resourceUrl": "https://example.com/evidence",
                        "paidAt": "2026-07-03T14:40:00+00:00",
                        "amount": "0.01",
                        "currency": "USDC",
                        "bindingStatus": "bound",
                        "receiptHash": "sha256:" + "e" * 64,
                    },
                },
                "guardrails": {
                    "roles": [
                        {
                            "agentRole": "proposer",
                            "traceSource": "deterministic",
                            "outputHash": "sha256:" + "f" * 64,
                            "promptHash": "sha256:" + "1" * 64,
                        }
                    ]
                },
                "readback": {
                    "proofDigest": "sha256:" + "a" * 64,
                    "source": "casper_json_rpc_query_global_state",
                    "stateRootHash": "state-root",
                    "receiptVerified": True,
                    "decisionReceipt": "public-proof-001|haircut|72",
                },
            }
        },
    }


def test_public_proof_serializer_is_allowlisted_and_redacts_private_values(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("CASPER_DECISION_LEDGER_PATH", str(tmp_path / "proof.sqlite3"))
    monkeypatch.setenv("CASPER_ACCOUNT_PUBLIC_KEY", "01" + "a" * 64)
    monkeypatch.setenv("CASPER_SECRET_KEY_PATH", "/Users/me/secret.pem")
    monkeypatch.setenv("CASPER_DECISION_CONTRACT_HASH", "hash-contract")
    monkeypatch.setenv("CASPER_DECISION_CONTRACT_PACKAGE_HASH", "hash-package")
    get_settings.cache_clear()
    CasperDecisionLedger.clear_current_log()
    CasperDecisionLedger.append_event(_decision_event())

    proof = CasperPublicProofService.get_public_proof({"demoUrl": "https://demo.example", "videoUrl": ""})
    proof_text = str(proof)

    assert proof["scenario"] == "rwa-collateral-nav-risk-receipt"
    assert proof["decisionId"] == "public-proof-001"
    assert proof["accountPublicKey"].startswith("01")
    assert proof["contractHash"] == "hash-contract"
    assert proof["contractPackageHash"] == "hash-package"
    assert proof["evidenceGraph"]["graphDigest"].startswith("sha256:")
    assert proof["policyTemplate"]["id"] == "rwa-collateral-v1"
    assert proof["x402"]["receipt"]["receiptHash"].startswith("sha256:")
    assert proof["x402"]["receipt"]["bindingStatus"] == "bound"
    assert proof["readback"]["verified"] is True
    assert proof["trustSummary"]["sampleSize"] == 1
    assert proof["llmTrace"]["roles"][0]["traceSource"] == "deterministic"
    assert "secret.pem" not in proof_text
    assert "ledgerPath" not in proof_text
    assert ".env" not in proof_text


def test_public_proof_endpoint_requires_no_private_session(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("CASPER_DECISION_LEDGER_PATH", str(tmp_path / "proof.sqlite3"))
    get_settings.cache_clear()
    CasperDecisionLedger.clear_current_log()
    CasperDecisionLedger.append_event(_decision_event("public-endpoint-001"))
    client = TestClient(create_app())

    response = client.get("/api/public/proof")

    assert response.status_code == 200
    body = response.json()
    assert body["network"] == "casper"
    assert body["decisionId"] == "public-endpoint-001"
    assert "ledgerPath" not in response.text
    assert "operator" not in response.text.lower()


def test_public_proof_writer_rejects_private_material(tmp_path) -> None:
    path = tmp_path / "proof.json"
    proof = {
        "network": "casper",
        "scenario": "rwa-collateral-nav-risk-receipt",
        "status": "blocked",
        "debug": "CASPER_SECRET_KEY_PATH=/Users/me/secret.pem",
    }

    with pytest.raises(ValueError):
        CasperPublicProofService.write_public_proof(proof, path)

    assert not path.exists()


def test_public_proof_writer_creates_sanitized_artifact(tmp_path) -> None:
    path = tmp_path / "proof.json"
    proof = {
        "network": "casper",
        "scenario": "rwa-collateral-nav-risk-receipt",
        "status": "blocked",
        "decisionId": "public-proof-001",
    }

    CasperPublicProofService.write_public_proof(proof, path)

    assert path.read_text(encoding="utf-8").endswith("\n")
    assert "public-proof-001" in path.read_text(encoding="utf-8")
