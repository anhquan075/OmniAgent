import asyncio
from datetime import datetime, timezone
from typing import Any

import httpx
import structlog

from app.services.casper.hashing import sha256_json


logger = structlog.get_logger(__name__)

TREASURY_API_URL = (
    "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/"
    "accounting/od/avg_interest_rates"
)
TREASURY_FETCH_ATTEMPTS = 3
TREASURY_FETCH_BACKOFF_SEC = 0.75
TREASURY_QUERY_PARAMS = {
    "fields": "record_date,security_desc,avg_interest_rate_amt",
    "filter": "security_desc:eq:Treasury Notes",
    "sort": "-record_date",
    "page[number]": "1",
    "page[size]": "5",
}
TREASURY_REQUEST_HEADERS = {
    "Accept": "application/json",
    "User-Agent": "OmniAgent-Casper-Proof/1.0",
}


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
    last_error: Exception | None = None
    for attempt in range(1, TREASURY_FETCH_ATTEMPTS + 1):
        try:
            async with httpx.AsyncClient(
                timeout=10.0,
                headers=TREASURY_REQUEST_HEADERS,
            ) as client:
                resp = await client.get(TREASURY_API_URL, params=TREASURY_QUERY_PARAMS)
            resp.raise_for_status()
            data = resp.json()
            last_error = None
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
            break
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code < 500:
                raise RuntimeError(f"treasury_yield_unavailable: {exc}") from exc
            last_error = exc
        except (httpx.TimeoutException, httpx.TransportError) as exc:
            last_error = exc
        except Exception as exc:
            raise RuntimeError(f"treasury_yield_unavailable: {exc}") from exc
        if last_error is not None and attempt < TREASURY_FETCH_ATTEMPTS:
            logger.warning(
                "treasury_yield_fetch_retry",
                attempt=attempt,
                attempts=TREASURY_FETCH_ATTEMPTS,
                error=str(last_error)[:200],
            )
            await asyncio.sleep(TREASURY_FETCH_BACKOFF_SEC * attempt)
    if last_error is not None:
        raise RuntimeError(f"treasury_yield_unavailable: {last_error}") from last_error
    raise RuntimeError("treasury_yield_unavailable: 10-year yield not found")


class CasperRwaEvidenceService:
    @staticmethod
    def build_evidence_bundle(args: dict[str, Any]) -> dict[str, Any]:
        raw_sources = args.get("evidence") or args.get("sources") or []
        sources = CasperRwaEvidenceService.normalize_sources(raw_sources)
        blockers = CasperRwaEvidenceService.blockers(sources)
        factors = CasperRwaEvidenceService.risk_factors(sources)
        evidence_graph = CasperRwaEvidenceService.evidence_graph(sources, factors)
        risk_score = max([factor["severity"] for factor in factors] or [0])
        status = "blocked" if blockers else "ready"
        action = "block" if blockers else CasperRwaEvidenceService.recommended_action(risk_score)
        bundle = {
            "network": "casper",
            "scenario": SCENARIO_NAME,
            "status": status,
            "sources": sources,
            "evidenceGraph": evidence_graph,
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
            "sources": CasperRwaEvidenceService.hashable_sources(sources),
            "riskFactors": factors,
            "evidenceGraphDigest": evidence_graph["graphDigest"],
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
            "sourceRecordDate": str(source.get("sourceRecordDate") or "").strip(),
            "source": str(source.get("source") or "").strip(),
            "status": "observed",
        }
        if not normalized["url"] or observed is None or threshold is None or not observed_at:
            normalized["status"] = "missing_observation"
        elif CasperRwaEvidenceService.is_stale(observed_at):
            normalized["status"] = "stale_observation"
        normalized["freshness"] = CasperRwaEvidenceService.freshness(observed_at)
        normalized["sourceHash"] = sha256_json(CasperRwaEvidenceService.hashable_source(normalized))
        return normalized

    @staticmethod
    def hashable_sources(sources: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return [CasperRwaEvidenceService.hashable_source(source) for source in sources]

    @staticmethod
    def hashable_source(source: dict[str, Any]) -> dict[str, Any]:
        payload = {
            key: value
            for key, value in source.items()
            # observedAt is when this process fetched the record, not an
            # economically material change. sourceRecordDate and value carry
            # the source's actual version and keep repeated polls idempotent.
            if key not in {"sourceHash", "freshness", "observedAt"}
        }
        freshness = source.get("freshness")
        if isinstance(freshness, dict):
            payload["freshnessStatus"] = freshness.get("status")
            payload["maxAgeHours"] = freshness.get("maxAgeHours")
        return payload

    @staticmethod
    def evidence_graph(sources: list[dict[str, Any]], factors: list[dict[str, Any]]) -> dict[str, Any]:
        nodes = [
            {
                "id": source["id"],
                "type": "source",
                "status": source["status"],
                "sourceHash": source.get("sourceHash"),
                "freshnessStatus": (source.get("freshness") or {}).get("status"),
            }
            for source in sources
        ]
        factor_nodes = [
            {
                "id": f"risk:{factor['sourceId']}:{factor['code']}",
                "type": "risk_factor",
                "code": factor["code"],
                "severity": factor["severity"],
            }
            for factor in factors
        ]
        edges = [
            {
                "from": source["id"],
                "to": f"risk:{factor['sourceId']}:{factor['code']}",
                "relationship": "contributes_to",
            }
            for source in sources
            for factor in factors
            if factor["sourceId"] == source["id"]
        ]
        graph = {
            "scenario": SCENARIO_NAME,
            "sourceCount": len(sources),
            "observedSourceCount": sum(1 for source in sources if source["status"] == "observed"),
            "staleSourceCount": sum(1 for source in sources if source["status"] == "stale_observation"),
            "missingSourceCount": sum(1 for source in sources if source["status"] == "missing_observation"),
            "nodes": nodes + factor_nodes,
            "edges": edges,
        }
        graph["graphDigest"] = sha256_json(graph)
        return graph

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

    @staticmethod
    def freshness(value: str) -> dict[str, Any]:
        try:
            observed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return {"status": "missing", "ageHours": None}
        if observed.tzinfo is None:
            observed = observed.replace(tzinfo=timezone.utc)
        age_hours = (datetime.now(timezone.utc) - observed.astimezone(timezone.utc)).total_seconds() / 3600
        return {
            "status": "fresh" if age_hours <= 36 else "stale",
            "ageHours": round(age_hours, 2),
            "maxAgeHours": 36,
        }
