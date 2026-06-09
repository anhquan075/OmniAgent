from typing import Any


class LedgerMemoryService:
    @staticmethod
    def build(
        ledger: dict[str, Any],
        preflight: dict[str, Any],
        proof_bundle: dict[str, Any],
        cycle: dict[str, Any] | None = None,
    ) -> dict[str, object]:
        events = [event for event in ledger.get("events") or [] if isinstance(event, dict)]
        latest = LedgerMemoryService.latest_decision(events, cycle or {})
        why_no_trade = LedgerMemoryService.why_no_trade(events, preflight, proof_bundle)
        why_trade = LedgerMemoryService.why_trade(events, preflight, proof_bundle, cycle or {})
        return {
            "source": "trade-ledger",
            "style": "finmem-inspired",
            "latestDecision": latest,
            "whyTrade": why_trade,
            "whyNoTrade": why_no_trade,
            "memoryLayers": {
                "shortTerm": LedgerMemoryService.short_term(events, preflight, proof_bundle),
                "episodic": LedgerMemoryService.episodic(events),
                "longTerm": LedgerMemoryService.long_term(ledger),
            },
            "nextSafeAction": LedgerMemoryService.next_safe_action(why_no_trade, preflight),
        }

    @staticmethod
    def latest_decision(events: list[dict[str, Any]], cycle: dict[str, Any]) -> dict[str, object]:
        cycle_decision = ((cycle.get("strategyDecision") or {}).get("decision") or {})
        if cycle_decision:
            return {
                "action": str(cycle_decision.get("action") or "hold"),
                "status": str(cycle.get("status") or "monitoring"),
                "reason": str(cycle_decision.get("rationale") or "latest autonomous cycle"),
                "source": str((cycle.get("strategyDecision") or {}).get("source") or "cycle"),
                "tradeIntentId": cycle.get("tradeIntentId"),
                "createdAt": cycle.get("completedAt") or cycle.get("startedAt"),
            }
        for event in events:
            event_type = str(event.get("eventType") or "ledger_event")
            payload = event.get("payload") if isinstance(event.get("payload"), dict) else {}
            action = event.get("action") or payload.get("side") or payload.get("action")
            reason = payload.get("reason") or payload.get("status") or event_type
            return {
                "action": str(action or LedgerMemoryService.action_from_event(event_type)),
                "status": str(payload.get("status") or LedgerMemoryService.status_from_event(event_type)),
                "reason": str(reason),
                "source": "trade-ledger",
                "tradeIntentId": event.get("tradeIntentId"),
                "createdAt": event.get("createdAt"),
            }
        return {
            "action": "observe",
            "status": "monitoring",
            "reason": "No ledger decisions recorded yet.",
            "source": "empty-ledger",
            "tradeIntentId": None,
            "createdAt": None,
        }

    @staticmethod
    def why_no_trade(
        events: list[dict[str, Any]],
        preflight: dict[str, Any],
        proof_bundle: dict[str, Any],
    ) -> list[str]:
        reasons: list[str] = []
        blockers = preflight.get("blockers") if isinstance(preflight.get("blockers"), list) else []
        for blocker in blockers[:4]:
            if isinstance(blocker, dict):
                reasons.append(str(blocker.get("reason") or blocker.get("name") or "preflight guarded"))
        proof_score = proof_bundle.get("proofScore") if isinstance(proof_bundle.get("proofScore"), dict) else {}
        for blocker in (proof_score.get("hardBlockers") or [])[:4]:
            reasons.append(str(blocker))
        for event in events:
            if event.get("eventType") != "trade_blocked":
                continue
            payload = event.get("payload") if isinstance(event.get("payload"), dict) else {}
            reasons.append(str(payload.get("reason") or event.get("action") or "trade blocked"))
            break
        return LedgerMemoryService.unique(reasons) or ["No active no-trade reason recorded."]

    @staticmethod
    def why_trade(
        events: list[dict[str, Any]],
        preflight: dict[str, Any],
        proof_bundle: dict[str, Any],
        cycle: dict[str, Any],
    ) -> list[str]:
        reasons: list[str] = []
        decision = ((cycle.get("strategyDecision") or {}).get("decision") or {})
        if decision.get("rationale"):
            reasons.append(str(decision["rationale"]))
        if preflight.get("readyForLiveTrade") is True:
            reasons.append("Live preflight passed all deterministic backend gates.")
        proof_score = proof_bundle.get("proofScore") if isinstance(proof_bundle.get("proofScore"), dict) else {}
        if proof_score.get("hardBlocked") is False:
            reasons.append("Proof bundle has no hard blockers.")
        for event in events:
            if event.get("eventType") in {"trade_executed", "trade_receipt_confirmed"}:
                reasons.append("Recent ledger has submitted or confirmed on-chain trade evidence.")
                break
        return LedgerMemoryService.unique(reasons) or ["No executable trade thesis recorded yet."]

    @staticmethod
    def short_term(
        events: list[dict[str, Any]],
        preflight: dict[str, Any],
        proof_bundle: dict[str, Any],
    ) -> list[str]:
        status = "live-ready" if preflight.get("readyForLiveTrade") is True else "guarded"
        proof_status = str(proof_bundle.get("status") or "proof sync")
        latest = str(events[0].get("eventType")) if events else "empty ledger"
        return [f"preflight {status}", f"proof {proof_status}", f"latest event {latest}"]

    @staticmethod
    def episodic(events: list[dict[str, Any]]) -> list[dict[str, object]]:
        episodes = []
        for event in events[:5]:
            payload = event.get("payload") if isinstance(event.get("payload"), dict) else {}
            episodes.append({
                "eventType": event.get("eventType"),
                "createdAt": event.get("createdAt"),
                "tradeIntentId": event.get("tradeIntentId"),
                "summary": str(payload.get("status") or payload.get("reason") or event.get("action") or "recorded"),
            })
        return episodes

    @staticmethod
    def long_term(ledger: dict[str, Any]) -> list[str]:
        compliance = ledger.get("dailyCompliance") if isinstance(ledger.get("dailyCompliance"), dict) else {}
        pnl = ledger.get("pnl") if isinstance(ledger.get("pnl"), dict) else {}
        return [
            "TWAK remains the only transaction executor and signer.",
            f"Confirmed trade progress {compliance.get('progress') or '0/7'}.",
            f"Max drawdown tracked at {float(pnl.get('maxDrawdownPct') or 0):.2f}%.",
        ]

    @staticmethod
    def next_safe_action(why_no_trade: list[str], preflight: dict[str, Any]) -> str:
        if preflight.get("readyForLiveTrade") is True:
            return "Let the deterministic backend policy decide the next TWAK execution."
        return why_no_trade[0] if why_no_trade else "Keep monitoring until proof and policy gates pass."

    @staticmethod
    def status_from_event(event_type: str) -> str:
        return {
            "trade_executed": "submitted",
            "trade_receipt_confirmed": "confirmed",
            "trade_blocked": "guarded",
            "risk_checked": "checked",
            "autonomous_cycle_completed": "completed",
        }.get(event_type, "recorded")

    @staticmethod
    def action_from_event(event_type: str) -> str:
        return "trade" if event_type in {"trade_executed", "trade_receipt_confirmed"} else "observe"

    @staticmethod
    def unique(values: list[str]) -> list[str]:
        seen: set[str] = set()
        result = []
        for value in values:
            clean = value.strip()
            if not clean or clean in seen:
                continue
            seen.add(clean)
            result.append(clean)
        return result
