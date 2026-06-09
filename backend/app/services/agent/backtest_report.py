from typing import Any


class BacktestRiskReportService:
    @staticmethod
    def build(ledger: dict[str, Any], proof_bundle: dict[str, Any]) -> dict[str, object]:
        events = [event for event in ledger.get("events") or [] if isinstance(event, dict)]
        counts = BacktestRiskReportService.count_events(events)
        pnl = ledger.get("pnl") if isinstance(ledger.get("pnl"), dict) else {}
        proof_score = proof_bundle.get("proofScore") if isinstance(proof_bundle.get("proofScore"), dict) else {}
        hard_blockers = proof_score.get("hardBlockers") if isinstance(proof_score.get("hardBlockers"), list) else []
        return {
            "source": "ledger-replay",
            "inspiredBy": ["freqtrade", "hummingbot"],
            "runtimeImported": False,
            "dryRunSummary": {
                "mode": "report_only",
                "cycles": counts["autonomous_cycle_completed"],
                "simulatedTrades": counts["risk_checked"],
                "submittedTrades": counts["trade_executed"],
                "confirmedTrades": counts["trade_receipt_confirmed"],
                "blockedTrades": counts["trade_blocked"],
            },
            "pnlSummary": {
                "totalReturnPct": float(pnl.get("totalReturnPct") or 0),
                "maxDrawdownPct": float(pnl.get("maxDrawdownPct") or 0),
                "registrationPeriod": pnl.get("registrationPeriod") or {},
            },
            "riskSummary": {
                "proofCoverage": BacktestRiskReportService.proof_coverage(proof_score),
                "hardBlockers": [str(item) for item in hard_blockers[:6]],
                "policyHolds": counts["trade_blocked"],
                "dailyCompliance": ledger.get("dailyCompliance") or {},
            },
        }

    @staticmethod
    def count_events(events: list[dict[str, Any]]) -> dict[str, int]:
        names = [
            "autonomous_cycle_completed",
            "risk_checked",
            "trade_executed",
            "trade_receipt_confirmed",
            "trade_blocked",
        ]
        return {name: sum(1 for event in events if event.get("eventType") == name) for name in names}

    @staticmethod
    def proof_coverage(score: dict[str, Any]) -> str:
        current = score.get("score")
        total = score.get("total") or score.get("maxScore")
        if current is None or total is None:
            return "syncing"
        return f"{int(current)}/{int(total)}"
