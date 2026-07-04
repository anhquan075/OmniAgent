from datetime import datetime, timezone

from app.services.casper.guardrails import CasperGuardrailService
from app.services.casper.hashing import sha256_json
from app.services.casper.rwa_evidence import CasperRwaEvidenceService
from app.services.casper.x402 import CasperX402EvidenceService


def fresh_observed_at() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def source_fixture() -> dict[str, object]:
    return {
        "id": "treasury-yield-10y",
        "label": "US 10Y Treasury yield",
        "url": "https://home.treasury.gov/resource-center/data-chart-center/interest-rates",
        "observedAt": fresh_observed_at(),
        "observedValue": 4.82,
        "threshold": 4.5,
        "unit": "percent",
    }


def test_rwa_evidence_normalizes_sources_and_hashes_stably() -> None:
    source = source_fixture()
    bundle = CasperRwaEvidenceService.build_evidence_bundle({"evidence": [source]})
    duplicate = CasperRwaEvidenceService.build_evidence_bundle({"evidence": [source.copy()]})

    assert bundle["scenario"] == "rwa-collateral-nav-risk-receipt"
    assert bundle["status"] == "ready"
    assert bundle["sourceHash"].startswith("sha256:")
    assert bundle["sourceHash"] == duplicate["sourceHash"]
    assert bundle["evidenceGraph"]["graphDigest"].startswith("sha256:")
    assert bundle["evidenceGraph"]["observedSourceCount"] == 1
    assert bundle["sources"][0]["sourceHash"].startswith("sha256:")
    assert bundle["sources"][0]["freshness"]["status"] == "fresh"
    assert bundle["riskScore"] >= 70
    assert bundle["recommendedAction"] == "haircut"
    assert bundle["sources"][0]["status"] == "observed"
    assert bundle["riskFactors"][0]["code"] == "threshold_breach"


def test_rwa_source_hash_ignores_live_age_counter() -> None:
    source = CasperRwaEvidenceService.normalize_source(source_fixture())
    source["freshness"]["ageHours"] = 12.34

    assert sha256_json(CasperRwaEvidenceService.hashable_source(source)) == source["sourceHash"]


def test_rwa_evidence_fails_closed_without_real_observation() -> None:
    bundle = CasperRwaEvidenceService.build_evidence_bundle({})

    assert bundle["status"] == "blocked"
    assert bundle["recommendedAction"] == "block"
    assert "rwa_evidence_missing" in bundle["hardBlockers"]
    assert bundle["sources"][0]["status"] == "missing_observation"


def test_guardrails_hash_role_outputs_and_block_unsafe_rebalance() -> None:
    evidence = CasperRwaEvidenceService.build_evidence_bundle({"evidence": [source_fixture()]})

    guardrails = CasperGuardrailService.evaluate(
        {
            "evidenceBundle": evidence,
            "proposedAction": "rebalance",
            "rationale": "Rebalance into higher-yield collateral.",
        }
    )

    assert guardrails["status"] == "blocked"
    assert guardrails["guardrailHash"].startswith("sha256:")
    assert [role["agentRole"] for role in guardrails["roles"]] == [
        "proposer",
        "critic",
        "policy_gate",
    ]
    assert "high_risk_rebalance_blocked" in guardrails["policyGate"]["reasonCodes"]
    assert all(role["rationaleHash"].startswith("sha256:") for role in guardrails["roles"])


def test_x402_readiness_is_explicit_when_not_configured(monkeypatch) -> None:
    monkeypatch.delenv("CASPER_X402_EVIDENCE_URL", raising=False)
    monkeypatch.delenv("CASPER_X402_RECEIPT", raising=False)

    readiness = CasperX402EvidenceService.get_readiness({})

    assert readiness["status"] == "unavailable"
    assert readiness["receipt"] is None
    assert "x402_evidence_endpoint_missing" in readiness["hardBlockers"]


def test_x402_requires_endpoint_and_receipt_to_be_ready(monkeypatch) -> None:
    monkeypatch.setenv("CASPER_X402_EVIDENCE_URL", "https://example.com/x402/rwa")
    monkeypatch.delenv("CASPER_X402_RECEIPT", raising=False)

    readiness = CasperX402EvidenceService.get_readiness({})

    assert readiness["status"] == "unavailable"
    assert "x402_receipt_missing" in readiness["hardBlockers"]


def test_x402_normalizes_public_receipt_metadata(monkeypatch) -> None:
    monkeypatch.setenv("CASPER_X402_EVIDENCE_URL", "https://example.com/x402/rwa")
    monkeypatch.setenv(
        "CASPER_X402_RECEIPT",
        (
            '{"receiptId":"paid-1","provider":"x402","resourceUrl":"https://example.com/x402/rwa",'
            '"paidAt":"2026-07-03T14:40:00+00:00","amount":"0.01","currency":"USDC"}'
        ),
    )

    readiness = CasperX402EvidenceService.get_readiness({})

    assert readiness["status"] == "verified"
    assert readiness["receipt"]["receiptId"] == "paid-1"
    assert readiness["receipt"]["bindingStatus"] == "bound"
    assert readiness["receipt"]["receiptHash"].startswith("sha256:")
    assert "CASPER_X402_RECEIPT" not in str(readiness)


def test_x402_rejects_unbound_receipt(monkeypatch) -> None:
    monkeypatch.setenv("CASPER_X402_EVIDENCE_URL", "https://example.com/x402/rwa")
    monkeypatch.setenv(
        "CASPER_X402_RECEIPT",
        (
            '{"receiptId":"paid-1","provider":"x402","resourceUrl":"https://example.com/other",'
            '"paidAt":"2026-07-03T14:40:00+00:00","amount":"0.01","currency":"USDC"}'
        ),
    )

    readiness = CasperX402EvidenceService.get_readiness({"sourceHash": "sha256:expected"})

    assert readiness["status"] == "configured"
    assert readiness["receipt"]["bindingStatus"] == "unbound"
    assert "x402_receipt_unbound" in readiness["hardBlockers"]


def test_x402_rejects_mismatched_source_hash_even_when_url_matches(monkeypatch) -> None:
    monkeypatch.setenv("CASPER_X402_EVIDENCE_URL", "https://example.com/x402/rwa")
    monkeypatch.setenv(
        "CASPER_X402_RECEIPT",
        (
            '{"receiptId":"paid-1","provider":"x402","resourceUrl":"https://example.com/x402/rwa",'
            '"paidAt":"2026-07-03T14:40:00+00:00","amount":"0.01","currency":"USDC",'
            '"sourceHash":"sha256:wrong"}'
        ),
    )

    readiness = CasperX402EvidenceService.get_readiness({"sourceHash": "sha256:expected"})

    assert readiness["status"] == "configured"
    assert readiness["receipt"]["bindingStatus"] == "unbound"
    assert "x402_receipt_unbound" in readiness["hardBlockers"]


def test_x402_rejects_mismatched_request_hash_even_when_url_matches(monkeypatch) -> None:
    monkeypatch.setenv("CASPER_X402_EVIDENCE_URL", "https://example.com/x402/rwa")
    monkeypatch.setenv(
        "CASPER_X402_RECEIPT",
        (
            '{"receiptId":"paid-1","provider":"x402","resourceUrl":"https://example.com/x402/rwa",'
            '"paidAt":"2026-07-03T14:40:00+00:00","amount":"0.01","currency":"USDC",'
            '"requestHash":"sha256:wrong"}'
        ),
    )

    readiness = CasperX402EvidenceService.get_readiness({"requestHash": "sha256:expected"})

    assert readiness["status"] == "configured"
    assert readiness["receipt"]["bindingStatus"] == "unbound"
    assert "x402_receipt_unbound" in readiness["hardBlockers"]


def test_x402_rejects_token_like_receipt(monkeypatch) -> None:
    monkeypatch.setenv("CASPER_X402_EVIDENCE_URL", "https://example.com/x402/rwa")
    monkeypatch.setenv("CASPER_X402_RECEIPT", '{"receiptId":"paid-1","token":"secret-token"}')

    readiness = CasperX402EvidenceService.get_readiness({})

    assert readiness["status"] == "unavailable"
    assert "x402_receipt_invalid" in readiness["hardBlockers"]
