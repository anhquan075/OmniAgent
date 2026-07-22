from fastapi.testclient import TestClient

from app.core.settings import get_settings
from app.main import create_app
from app.services.casper.ledger import CasperDecisionLedger
from app.services.casper.x402_endpoint import CasperX402EvidenceEndpointService


def _decision_event() -> dict[str, object]:
    return {
        "eventType": "casper_decision_submitted",
        "payload": {
            "decision": {
                "decisionId": "x402-evidence-001",
                "action": "approve",
                "riskScore": 22,
                "timestamp": "2026-07-04T13:42:00+00:00",
                "proofDigest": "sha256:" + "a" * 64,
                "sourceHash": "sha256:" + "b" * 64,
                "guardrailHash": "sha256:" + "c" * 64,
                "policyGate": "approved",
                "deployHash": "d" * 64,
                "decisionReceipt": {"receiptValue": "x402-evidence-001|approve|22"},
                "evidenceBundle": {
                    "sourceHash": "sha256:" + "b" * 64,
                    "sources": [
                        {
                            "id": "us-treasury-notes-average-interest-rate",
                            "label": "US Treasury Notes Average Interest Rate",
                            "observedValue": 3.248,
                            "threshold": 5.0,
                            "unit": "percent",
                        }
                    ],
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
                "guardrails": {"roles": []},
                "readback": {
                    "proofDigest": "sha256:" + "a" * 64,
                    "source": "casper_json_rpc_query_global_state",
                    "stateRootHash": "state-root",
                    "receiptVerified": True,
                    "decisionReceipt": "x402-evidence-001|approve|22",
                },
            }
        },
    }


def test_x402_setup_endpoint_reports_missing_pay_to(monkeypatch) -> None:
    monkeypatch.delenv("CASPER_X402_PAY_TO_ADDRESS", raising=False)
    monkeypatch.delenv("CASPER_X402_FACILITATOR_API_KEY", raising=False)
    monkeypatch.delenv("CASPER_CSPR_CLOUD_API_KEY", raising=False)
    get_settings.cache_clear()
    client = TestClient(create_app())

    setup_response = client.get("/api/x402/setup")
    evidence_response = client.get("/api/x402/rwa-evidence")

    assert setup_response.status_code == 200
    setup = setup_response.json()
    assert setup["status"] == "setup_required"
    assert "casper_x402_pay_to_address_missing" in setup["hardBlockers"]
    assert evidence_response.status_code == 503
    assert evidence_response.json()["status"] == "setup_required"


def test_x402_cors_allows_payment_headers(monkeypatch) -> None:
    monkeypatch.setenv("ALLOWED_FRONTEND_ORIGINS", "https://omniyield.app")
    get_settings.cache_clear()
    client = TestClient(create_app())

    response = client.options(
        "/api/x402/rwa-evidence",
        headers={
            "Origin": "https://omniyield.app",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "x-payment,payment-signature",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "https://omniyield.app"
    allowed_headers = response.headers["access-control-allow-headers"].lower()
    assert "x-payment" in allowed_headers
    assert "payment-signature" in allowed_headers


def test_x402_setup_ready_when_fully_configured(monkeypatch) -> None:
    monkeypatch.setenv(
        "CASPER_X402_PAY_TO_ADDRESS",
        "00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    )
    monkeypatch.setenv("CASPER_X402_EVIDENCE_URL", "https://example.com/api/x402/rwa-evidence")
    monkeypatch.setenv("CASPER_X402_FACILITATOR_API_KEY", "test-key")
    monkeypatch.setenv("CASPER_X402_NETWORK", "casper:casper-test")
    get_settings.cache_clear()

    setup = CasperX402EvidenceEndpointService.setup_status(get_settings())

    assert setup["status"] == "ready"
    assert setup["endpoint"] == "https://example.com/api/x402/rwa-evidence"
    assert setup["paymentNetwork"] == "casper:casper-test"
    assert setup["currency"] == "WCSPR"
    assert setup["hardBlockers"] == []
    assert setup["settleReady"] is True


def test_x402_unpaid_request_returns_casper_402(monkeypatch) -> None:
    monkeypatch.setenv(
        "CASPER_X402_PAY_TO_ADDRESS",
        "00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    )
    monkeypatch.setenv("CASPER_X402_FACILITATOR_API_KEY", "test-key")
    monkeypatch.setenv("CASPER_X402_NETWORK", "casper:casper-test")
    get_settings.cache_clear()
    client = TestClient(create_app())

    response = client.get("/api/x402/rwa-evidence")

    assert response.status_code == 402
    body = response.json()
    assert body["x402Version"] == 2
    assert body["accepts"][0]["scheme"] == "exact"
    assert body["accepts"][0]["network"] == "casper:casper-test"
    assert "amount" in body["accepts"][0]
    assert body["accepts"][0]["asset"].startswith("hash-")
    assert "PAYMENT-REQUIRED" in response.headers


def test_x402_rejects_eip155_network(monkeypatch) -> None:
    monkeypatch.setenv("CASPER_X402_PAY_TO_ADDRESS", "00aa")
    monkeypatch.setenv("CASPER_X402_NETWORK", "eip155:84532")
    monkeypatch.setenv("CASPER_X402_FACILITATOR_API_KEY", "test-key")
    get_settings.cache_clear()

    setup = CasperX402EvidenceEndpointService.setup_status(get_settings())
    assert "casper_x402_network_unsupported" in setup["hardBlockers"]


def test_x402_paid_evidence_payload_binds_to_public_proof(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("CASPER_DECISION_LEDGER_PATH", str(tmp_path / "x402.sqlite3"))
    monkeypatch.setenv(
        "CASPER_X402_PAY_TO_ADDRESS",
        "00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    )
    monkeypatch.setenv("CASPER_X402_EVIDENCE_URL", "https://example.com/api/x402/rwa-evidence")
    get_settings.cache_clear()
    CasperDecisionLedger.clear_current_log()
    CasperDecisionLedger.append_event(_decision_event())

    payload = CasperX402EvidenceEndpointService.paid_evidence_payload(get_settings())

    assert payload["provider"] == "x402"
    assert payload["resourceUrl"] == "https://example.com/api/x402/rwa-evidence"
    assert payload["binding"]["decisionId"] == "x402-evidence-001"
    assert payload["binding"]["sourceHash"] == "sha256:" + "b" * 64
    assert payload["publicProof"]["decisionId"] == "x402-evidence-001"
    assert payload["receiptBindingHint"]["sourceHash"] == "sha256:" + "b" * 64
    assert payload["payment"]["network"] == "casper:casper-test"
