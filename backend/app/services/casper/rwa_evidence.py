from datetime import datetime, timezone
from typing import Any

import httpx

from app.services.casper.hashing import sha256_json


TREASURY_API_URL = (
    "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/"
    "accounting/od/avg_interest_rates"
)


SCENARIO_NAME = "rwa-collateral-nav-risk-receipt"

REFERENCE_SOURCE = {
    "id": "us-treasury-yield-reference",
    "label": "US Treasury yield curve reference",
    "url": "https://home.treasury.gov/resource-center/data-chart-center/interest-rates",
    "unit": "percent",
}


async def fetch_treasury_yield() -> list[dict[str, Any]]:
    """Fetch live US Treasury 10-Year yield from fiscaldata.treasury.gov.

    No API key is required. Demo runtime must fail closed instead of
    substituting static evidence when this public API is unavailable.
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(TREASURY_API_URL, params={
                "fields": "record_date,security_desc,avg_interest_rate_amt",
                "filter": "security_desc:eq:Treasury Notes",
                "sort": "-record_date",
                "page[number]": "1",
                "page[size]": "5",
            })
            resp.raise_for_status()
            data = resp.json()
            records = data.get("data", [])
            for record in records:
                sec_desc = str(record.get("security_desc", ""))
                if "10-Year" in sec_desc or "10 Year" in sec_desc or sec_desc == "Treasury Notes":
                    rate = float(record.get("avg_interest_rate_amt") or record["avg_interest_rate"])
                    label = (
                        "US Treasury 10-Year Yield"
                        if "10-Year" in sec_desc or "10 Year" in sec_desc
                        else "US Treasury Notes Average Interest Rate"
                    )
                    return [{
                        "id": "us-treasury-notes-average-interest-rate",
                        "label": label,
                        "url": "https://home.treasury.gov/resource-center/data-chart-center/interest-rates",
                        "observedAt": datetime.now(timezone.utc).isoformat(),
                        "observedValue": rate,
                        "threshold": 5.00,
                        "unit": "percent",
                        "source": "live_treasury_api",
                        "sourceRecordDate": record.get("record_date"),
                    }]
    except Exception as exc:
        raise RuntimeError(f"treasury_yield_unavailable: {exc}") from exc
    raise RuntimeError("treasury_yield_unavailable: 10-year yield not found")


class CasperRwaEvidenceService:
    @staticmethod
    def build_evidence_bundle(args: dict[str, Any]) -> dict[str, Any]:
        raw_sources = args.get("evidence") or args.get("sources") or []
        sources = CasperRwaEvidenceService.normalize_sources(raw_sources)
        blockers = CasperRwaEvidenceService.blockers(sources)
        factors = CasperRwaEvidenceService.risk_factors(sources)
        risk_score = max([factor["severity"] for factor in factors] or [0])
        status = "blocked" if blockers else "ready"
        action = "block" if blockers else CasperRwaEvidenceService.recommended_action(risk_score)
        bundle = {
            "network": "casper",
            "scenario": SCENARIO_NAME,
            "status": status,
            "sources": sources,
            "riskFactors": factors,
            "riskScore": risk_score,
            "recommendedAction": action,
            "policyThresholds": {
                "warnRiskScore": 70,
                "blockRiskScore": 90,
                "maxObservationAgeHours": 36,
            },
            "hardBlockers": blockers,
        }
        bundle["sourceHash"] = sha256_json({
            "scenario": bundle["scenario"],
            "sources": sources,
            "riskFactors": factors,
            "policyThresholds": bundle["policyThresholds"],
        })
        return bundle

    @staticmethod
    def normalize_sources(raw_sources: object) -> list[dict[str, Any]]:
        if not isinstance(raw_sources, list) or not raw_sources:
            return [{**REFERENCE_SOURCE, "status": "missing_observation"}]
        return [CasperRwaEvidenceService.normalize_source(item) for item in raw_sources]

    @staticmethod
    def normalize_source(raw: object) -> dict[str, Any]:
        source = raw if isinstance(raw, dict) else {}
        observed = CasperRwaEvidenceService.float_or_none(source.get("observedValue"))
        threshold = CasperRwaEvidenceService.float_or_none(source.get("threshold"))
        observed_at = str(source.get("observedAt") or "").strip()
        normalized = {
            "id": str(source.get("id") or "rwa-source"),
            "label": str(source.get("label") or "RWA evidence source"),
            "url": str(source.get("url") or ""),
            "observedAt": observed_at,
            "observedValue": observed,
            "threshold": threshold,
            "unit": str(source.get("unit") or "unit"),
            "status": "observed",
        }
        if not normalized["url"] or observed is None or threshold is None or not observed_at:
            normalized["status"] = "missing_observation"
        elif CasperRwaEvidenceService.is_stale(observed_at):
            normalized["status"] = "stale_observation"
        return normalized

    @staticmethod
    def blockers(sources: list[dict[str, Any]]) -> list[str]:
        blockers: list[str] = []
        if any(source["status"] == "missing_observation" for source in sources):
            blockers.append("rwa_evidence_missing")
        if any(source["status"] == "stale_observation" for source in sources):
            blockers.append("rwa_evidence_stale")
        return blockers

    @staticmethod
    def risk_factors(sources: list[dict[str, Any]]) -> list[dict[str, Any]]:
        factors: list[dict[str, Any]] = []
        for source in sources:
            observed = source.get("observedValue")
            threshold = source.get("threshold")
            if not isinstance(observed, (int, float)) or not isinstance(threshold, (int, float)):
                factors.append({"code": "missing_observation", "severity": 100, "sourceId": source["id"]})
            elif threshold and observed > threshold:
                delta_ratio = min(1.0, max(0.0, (observed - threshold) / abs(threshold)))
                factors.append({
                    "code": "threshold_breach",
                    "severity": min(100, 70 + int(delta_ratio * 100)),
                    "sourceId": source["id"],
                })
            else:
                factors.append({"code": "within_policy_band", "severity": 22, "sourceId": source["id"]})
        return factors

    @staticmethod
    def recommended_action(risk_score: int) -> str:
        if risk_score >= 90:
            return "block"
        if risk_score >= 70:
            return "haircut"
        return "approve"

    @staticmethod
    def float_or_none(value: object) -> float | None:
        try:
            return float(value) if value is not None and value != "" else None
        except (TypeError, ValueError):
            return None

    @staticmethod
    def is_stale(value: str) -> bool:
        try:
            observed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return True
        if observed.tzinfo is None:
            observed = observed.replace(tzinfo=timezone.utc)
        age_hours = (datetime.now(timezone.utc) - observed.astimezone(timezone.utc)).total_seconds() / 3600
        return age_hours > 36
