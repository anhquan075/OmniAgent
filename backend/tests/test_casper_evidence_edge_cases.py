from datetime import datetime, timedelta, timezone

from app.services.casper.rwa_evidence import CasperRwaEvidenceService
from tests.casper_evidence_fixtures import sample_treasury_evidence


def fresh_timestamp(hours_ago: float = 0) -> str:
    return (datetime.now(timezone.utc) - timedelta(hours=hours_ago)).isoformat()


def source(**overrides) -> dict[str, object]:
    base = {
        "id": "test-source",
        "label": "Test RWA source",
        "url": "https://example.gov/data",
        "observedAt": fresh_timestamp(),
        "observedValue": 3.5,
        "threshold": 4.0,
        "unit": "percent",
    }
    base.update(overrides)
    return base


def test_default_fixture_produces_ready_evidence() -> None:
    bundle = CasperRwaEvidenceService.build_evidence_bundle({"evidence": sample_treasury_evidence()})
    assert bundle["scenario"] == "rwa-collateral-nav-risk-receipt"
    assert bundle["status"] == "ready"
    assert bundle["sources"][0]["id"] == "us-treasury-10y-yield"
    assert bundle["recommendedAction"] == "approve"


def test_stale_observation_triggers_stale_blocker() -> None:
    bundle = CasperRwaEvidenceService.build_evidence_bundle({"evidence": [source(observedAt=fresh_timestamp(40))]})
    assert "rwa_evidence_stale" in bundle["hardBlockers"]
    assert bundle["status"] == "blocked"
    assert bundle["recommendedAction"] == "block"


def test_missing_url_triggers_missing_blocker() -> None:
    bundle = CasperRwaEvidenceService.build_evidence_bundle({"evidence": [source(url="")]})
    assert "rwa_evidence_missing" in bundle["hardBlockers"]
    assert bundle["sources"][0]["status"] == "missing_observation"


def test_missing_observed_value_triggers_missing_blocker() -> None:
    bundle = CasperRwaEvidenceService.build_evidence_bundle({"evidence": [source(observedValue=None)]})
    assert "rwa_evidence_missing" in bundle["hardBlockers"]


def test_threshold_breach_severity_uses_delta_ratio() -> None:
    bundle = CasperRwaEvidenceService.build_evidence_bundle({"evidence": [source(observedValue=6.0, threshold=4.0)]})
    factor = bundle["riskFactors"][0]
    assert factor["code"] == "threshold_breach"
    delta_ratio = (6.0 - 4.0) / 4.0
    assert factor["severity"] == min(100, 70 + int(delta_ratio * 100))


def test_within_policy_band_returns_severity_22() -> None:
    bundle = CasperRwaEvidenceService.build_evidence_bundle({"evidence": [source(observedValue=3.0, threshold=4.0)]})
    assert bundle["riskFactors"][0]["code"] == "within_policy_band"
    assert bundle["riskFactors"][0]["severity"] == 22


def test_empty_sources_falls_back_to_reference() -> None:
    bundle = CasperRwaEvidenceService.build_evidence_bundle({})
    assert bundle["sources"][0]["status"] == "missing_observation"
    assert "rwa_evidence_missing" in bundle["hardBlockers"]


def test_source_hash_is_deterministic() -> None:
    src = source()
    b1 = CasperRwaEvidenceService.build_evidence_bundle({"evidence": [src]})
    b2 = CasperRwaEvidenceService.build_evidence_bundle({"evidence": [src]})
    assert b1["sourceHash"] == b2["sourceHash"]


def test_risk_score_is_max_of_factors() -> None:
    bundle = CasperRwaEvidenceService.build_evidence_bundle({
        "evidence": [
            source(id="low", observedValue=3.0, threshold=4.0),
            source(id="high", observedValue=8.0, threshold=4.0),
        ]
    })
    assert bundle["riskScore"] == max(f["severity"] for f in bundle["riskFactors"])


def test_action_mapping_approve_below_70() -> None:
    assert CasperRwaEvidenceService.recommended_action(50) == "approve"


def test_action_mapping_haircut_70_to_89() -> None:
    assert CasperRwaEvidenceService.recommended_action(75) == "haircut"


def test_action_mapping_block_at_90() -> None:
    assert CasperRwaEvidenceService.recommended_action(90) == "block"
    assert CasperRwaEvidenceService.recommended_action(100) == "block"


def test_mixed_sources_with_stale_and_observed() -> None:
    bundle = CasperRwaEvidenceService.build_evidence_bundle({
        "evidence": [
            source(id="good", observedAt=fresh_timestamp(1)),
            source(id="stale", observedAt=fresh_timestamp(40)),
        ]
    })
    assert "rwa_evidence_stale" in bundle["hardBlockers"]
    assert bundle["status"] == "blocked"


def test_float_or_none_handles_invalid_inputs() -> None:
    assert CasperRwaEvidenceService.float_or_none(None) is None
    assert CasperRwaEvidenceService.float_or_none("") is None
    assert CasperRwaEvidenceService.float_or_none("abc") is None
    assert CasperRwaEvidenceService.float_or_none("4.5") == 4.5
    assert CasperRwaEvidenceService.float_or_none(4) == 4.0


def test_is_stale_handles_bad_iso_format() -> None:
    assert CasperRwaEvidenceService.is_stale("not-a-date") is True
    assert CasperRwaEvidenceService.is_stale("") is True
