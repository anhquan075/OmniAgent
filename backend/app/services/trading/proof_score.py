from typing import Any


class TradeProofScoreService:
    CHECKS = [
        "cmcSignalVerified",
        "cmcPriceFresh",
        "riskPolicyApproved",
        "routerQuoteValid",
        "twakWalletMatched",
        "competitionRegistered",
        "receiptProofValid",
        "pnlDrawdownCompliant",
    ]

    @classmethod
    def score(
        cls,
        *,
        preflight: dict[str, Any] | None = None,
        ledger: dict[str, Any] | None = None,
        receipt: dict[str, Any] | None = None,
        submission: dict[str, Any] | None = None,
        twak_status: dict[str, Any] | None = None,
        competition: dict[str, Any] | None = None,
        prices: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        checks = {
            "cmcSignalVerified": cls._cmc_signal_verified(preflight, submission),
            "cmcPriceFresh": cls._check_ok(preflight, "cmc") or cls._prices_ready(prices),
            "riskPolicyApproved": not cls._has_blocker(preflight, "risk"),
            "routerQuoteValid": cls._check_ok(preflight, "funded_route"),
            "twakWalletMatched": cls._check_ok(preflight, "twak") or bool(twak_status and twak_status.get("ready")),
            "competitionRegistered": cls._check_ok(preflight, "competition") or bool(competition and competition.get("registered")),
            "receiptProofValid": bool(cls._receipt_proof(receipt).get("valid")),
            "pnlDrawdownCompliant": not bool((ledger or {}).get("control", {}).get("emergencyPaused")),
        }
        hard_blockers = cls.hard_blockers(preflight, ledger, receipt)
        score = sum(1 for name in cls.CHECKS if checks[name])
        return {
            "score": score,
            "maxScore": len(cls.CHECKS),
            "status": "blocked" if hard_blockers else ("pass" if score == len(cls.CHECKS) else "incomplete"),
            "hardBlocked": bool(hard_blockers),
            "hardBlockers": hard_blockers,
            "checks": checks,
            "note": "Score is explanatory only; hard blockers decide readiness.",
        }

    @classmethod
    def hard_blockers(
        cls,
        preflight: dict[str, Any] | None,
        ledger: dict[str, Any] | None,
        receipt: dict[str, Any] | None,
    ) -> list[str]:
        blockers: list[str] = []
        active_names = {
            str(item.get("name") or "")
            for item in (preflight or {}).get("blockers") or []
            if isinstance(item, dict)
        }
        for item in (preflight or {}).get("blockers") or []:
            if isinstance(item, dict):
                name = str(item.get("name") or "")
                if name == "funded_route" and "cmc_agent_hub_signal" in active_names:
                    continue
                blockers.append(name or str(item.get("reason") or "preflight_blocker"))
        proof = cls._receipt_proof(receipt)
        blockers.extend(str(reason) for reason in proof.get("reasons") or [])
        if isinstance(receipt, dict) and receipt.get("status") == "pending":
            blockers.append("receipt_pending")
        if isinstance(receipt, dict) and receipt.get("status") == "failed":
            blockers.append("receipt_failed")
        if (ledger or {}).get("control", {}).get("emergencyPaused"):
            blockers.append("emergency_pause")
        return cls._dedupe(blockers)

    @staticmethod
    def _cmc_signal_verified(preflight: dict[str, Any] | None, submission: dict[str, Any] | None) -> bool:
        signal = (preflight or {}).get("cmcAgentHubSignal")
        if not isinstance(signal, dict):
            payload = submission.get("payload") if isinstance(submission, dict) else {}
            signal = payload.get("cmcAgentHubSignal") if isinstance(payload, dict) else {}
        return bool(isinstance(signal, dict) and signal.get("ready") and signal.get("serverVerified"))

    @staticmethod
    def _receipt_proof(receipt: dict[str, Any] | None) -> dict[str, Any]:
        proof = receipt.get("proof") if isinstance(receipt, dict) else {}
        return proof if isinstance(proof, dict) else {}

    @staticmethod
    def _check_ok(preflight: dict[str, Any] | None, name: str) -> bool:
        checks = preflight.get("checks") if isinstance(preflight, dict) else []
        checks = checks if isinstance(checks, list) else []
        return any(isinstance(item, dict) and item.get("name") == name and item.get("ok") for item in checks)

    @staticmethod
    def _has_blocker(preflight: dict[str, Any] | None, name: str) -> bool:
        blockers = preflight.get("blockers") if isinstance(preflight, dict) else []
        return any(isinstance(item, dict) and item.get("name") == name for item in blockers)

    @staticmethod
    def _prices_ready(prices: dict[str, Any] | None) -> bool:
        symbols = prices.get("symbols") if isinstance(prices, dict) else {}
        return any(bool(item.get("priceUsd")) for item in symbols.values() if isinstance(item, dict))

    @staticmethod
    def _dedupe(items: list[str]) -> list[str]:
        seen: set[str] = set()
        result: list[str] = []
        for item in items:
            if item and item not in seen:
                seen.add(item)
                result.append(item)
        return result
