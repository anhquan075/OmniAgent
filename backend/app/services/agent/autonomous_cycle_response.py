from datetime import datetime, timezone
from typing import Any

from app.services.shared.ledger import TradeLedger


class AutonomousCycleResponse:
    @staticmethod
    def hold(
        *,
        trade_intent_id: str,
        started_at: str,
        symbol: str,
        side: str,
        amount_usd: float,
        slippage_bps: int,
        execute: bool,
        record_ledger: bool,
        stages: list[dict[str, object]],
        cmc_agent_hub: dict[str, Any],
        cmc_agent_hub_signal: dict[str, Any] | None,
        cmc_snapshot: dict[str, Any],
        strategy: dict[str, Any],
    ) -> dict[str, Any]:
        decision = strategy.get("decision") if isinstance(strategy.get("decision"), dict) else {}
        risk = {
            "network": "bsc",
            "tradeIntentId": trade_intent_id,
            "symbol": symbol,
            "side": side,
            "amountUsd": amount_usd,
            "slippageBps": slippage_bps,
            "approved": False,
            "guardrailsPass": False,
            "reasons": ["strategy_hold"],
            "policy": {"approved": False, "reasons": ["strategy_hold"]},
        }
        execution = {
            "network": "bsc",
            "status": "blocked",
            "reason": str(decision.get("rationale") or "strategy_hold"),
            "simulation": {"canExecute": False, "reason": "strategy_hold"},
        }
        event = AutonomousCycleResponse.event(
            trade_intent_id=trade_intent_id,
            symbol=symbol,
            side=side,
            amount_usd=amount_usd,
            execute=execute,
            stages=stages,
            status="blocked",
            strategy=strategy,
            record_ledger=record_ledger,
        )
        return AutonomousCycleResponse.payload(
            trade_intent_id=trade_intent_id,
            started_at=started_at,
            event=event,
            execute=execute,
            status="blocked",
            stages=stages,
            cmc_agent_hub=cmc_agent_hub,
            cmc_agent_hub_signal=cmc_agent_hub_signal,
            cmc_snapshot=cmc_snapshot,
            strategy=strategy,
            quote={},
            risk=risk,
            execution=execution,
            record_ledger=record_ledger,
            tools=AutonomousCycleResponse.tools(cmc_agent_hub_signal, execute, stopped_at_strategy=True),
        )

    @staticmethod
    def completed(
        *,
        trade_intent_id: str,
        started_at: str,
        symbol: str,
        side: str,
        amount_usd: float,
        execute: bool,
        stages: list[dict[str, object]],
        cmc_agent_hub: dict[str, Any],
        cmc_agent_hub_signal: dict[str, Any] | None,
        cmc_snapshot: dict[str, Any],
        strategy: dict[str, Any],
        quote: dict[str, Any],
        risk: dict[str, Any],
        execution: dict[str, Any],
        can_execute: bool,
        record_ledger: bool,
    ) -> dict[str, Any]:
        status = str(execution.get("status") or ("ready" if can_execute else "blocked"))
        event = AutonomousCycleResponse.event(
            trade_intent_id=trade_intent_id,
            symbol=symbol,
            side=side,
            amount_usd=amount_usd,
            execute=execute,
            stages=stages,
            status=status,
            strategy=strategy,
            record_ledger=record_ledger,
        )
        return AutonomousCycleResponse.payload(
            trade_intent_id=trade_intent_id,
            started_at=started_at,
            event=event,
            execute=execute,
            status=status,
            stages=stages,
            cmc_agent_hub=cmc_agent_hub,
            cmc_agent_hub_signal=cmc_agent_hub_signal,
            cmc_snapshot=cmc_snapshot,
            strategy=strategy,
            quote=quote,
            risk=risk,
            execution=execution,
            record_ledger=record_ledger,
            tools=AutonomousCycleResponse.tools(cmc_agent_hub_signal, execute),
        )

    @staticmethod
    def event(**kwargs: Any) -> dict[str, Any]:
        event = {
            "eventType": "autonomous_cycle_completed",
            "tradeIntentId": kwargs["trade_intent_id"],
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "payload": {
                "symbol": kwargs["symbol"],
                "side": kwargs["side"],
                "amountUsd": kwargs["amount_usd"],
                "execute": kwargs["execute"],
                "stages": kwargs["stages"],
                "status": kwargs["status"],
                "strategyDecision": kwargs["strategy"],
            },
        }
        return TradeLedger.append_event(event) if kwargs["record_ledger"] else event

    @staticmethod
    def payload(**kwargs: Any) -> dict[str, Any]:
        return {
            "network": "bsc",
            "tradeIntentId": kwargs["trade_intent_id"],
            "startedAt": kwargs["started_at"],
            "completedAt": kwargs["event"]["createdAt"],
            "mode": "execute" if kwargs["execute"] else "dry_run",
            "status": kwargs["status"],
            "toolsUsed": kwargs["tools"],
            "stages": kwargs["stages"],
            "cmcAgentHub": kwargs["cmc_agent_hub"],
            "cmcAgentHubSignal": kwargs["cmc_agent_hub_signal"],
            "cmcSnapshot": kwargs["cmc_snapshot"],
            "strategyDecision": kwargs["strategy"],
            "quote": kwargs["quote"],
            "risk": kwargs["risk"],
            "execution": kwargs["execution"],
            **({"ledgerEvent": kwargs["event"]} if kwargs["record_ledger"] else {}),
        }

    @staticmethod
    def tools(cmc_agent_hub_signal: dict[str, Any] | None, execute: bool, stopped_at_strategy: bool = False) -> list[str]:
        tools = [
            "cmc_agent_hub_status",
            "cmc_get_price_snapshot",
            *(["cmc_agent_hub_call_tool"] if cmc_agent_hub_signal else []),
            "bnb_strategy_decision",
        ]
        if not stopped_at_strategy:
            tools.extend(["bnb_quote_trade", "bnb_risk_check", "bnb_execute_trade" if execute else "bnb_simulate_trade"])
        return tools
