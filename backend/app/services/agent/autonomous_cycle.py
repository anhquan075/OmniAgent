from datetime import datetime, timezone
from uuid import uuid4

from app.core.settings import get_settings
from app.services.agent.autonomous_cycle_response import AutonomousCycleResponse
from app.services.agent.autonomous_cycle_sensing import AutonomousCycleSensing
from app.services.trading.execution import TradeExecutionService
from app.services.cmc.signal_config import CmcSignalConfigService
from app.services.agent.strategy_decision import TradingStrategyDecisionService
from app.services.trading.pancake import PancakeRouterService
from app.services.trading.risk import RiskCheckService
from app.services.wallet.agent_wallet import AgentWalletService
class AutonomousTradingAgent:
    @staticmethod
    async def run_autonomous_cycle(args: dict[str, object]) -> dict[str, object]:
        symbol = str(args.get("symbol") or "CAKE").upper()
        side = str(args.get("side") or "buy").lower()
        amount_usd = float(args.get("amountUsd") or 25)
        slippage_bps = int(args.get("slippageBps") or 50)
        signal_source = str(args.get("signalSource") or "cmc")
        execute = bool(args.get("execute"))
        record_ledger = bool(args.get("recordLedger", True))
        wallet = AgentWalletService.get_wallet_data()
        trade_intent_id = str(args.get("tradeIntentId") or f"intent-{uuid4().hex[:12]}")
        started_at = datetime.now(timezone.utc).isoformat()
        stages: list[dict[str, object]] = [
            {
                "stage": "sense",
                "state": "running",
                "tool": "cmc_agent_hub_status",
                "note": f"{signal_source} signal selected",
            },
        ]
        sensing = await AutonomousCycleSensing.collect(
            args=args,
            symbol=symbol,
            side=side,
            amount_usd=amount_usd,
            signal_source=signal_source,
            execute=execute,
            stages=stages,
        )
        cmc_signal_tool = sensing["cmcSignalTool"]
        cmc_agent_hub = sensing["cmcAgentHub"]
        cmc_snapshot = sensing["cmcSnapshot"]
        cmc_agent_hub_signal = sensing["cmcAgentHubSignal"]
        strategy = await TradingStrategyDecisionService.evaluate(
            symbol=symbol,
            side=side,
            amount_usd=amount_usd,
            slippage_bps=slippage_bps,
            cmc_snapshot=cmc_snapshot,
            cmc_agent_hub_signal=cmc_agent_hub_signal,
            execute=execute,
        )
        strategy_decision = strategy.get("decision") if isinstance(strategy.get("decision"), dict) else {}
        strategy_action = str(strategy_decision.get("action") or "hold").lower()
        stages.append({
            "stage": "strategy",
            "state": "approved" if strategy_action in {"buy", "sell"} else "blocked",
            "tool": "openrouter_strategy_advisor" if strategy.get("source") == "openrouter" else "deterministic_strategy_policy",
            "note": str(strategy_decision.get("rationale") or "strategy_decision_missing"),
        })
        if strategy_action == "hold":
            return AutonomousCycleResponse.hold(
                trade_intent_id=trade_intent_id,
                started_at=started_at,
                symbol=symbol,
                side=side,
                amount_usd=amount_usd,
                slippage_bps=slippage_bps,
                execute=execute,
                record_ledger=record_ledger,
                stages=stages,
                cmc_agent_hub=cmc_agent_hub,
                cmc_agent_hub_signal=cmc_agent_hub_signal,
                cmc_snapshot=cmc_snapshot,
                strategy=strategy,
            )
        side = strategy_action
        amount_usd = min(amount_usd, float(strategy_decision.get("maxAmountUsd") or amount_usd))
        slippage_bps = min(slippage_bps, int(strategy_decision.get("slippageBps") or slippage_bps))
        price_usd = AutonomousTradingAgent.price_usd_from_snapshot(cmc_snapshot, symbol)
        quote: dict[str, object] = {}
        if side == "sell" and price_usd is None:
            stages.append({
                "stage": "quote",
                "state": "blocked",
                "tool": "bnb_quote_trade",
                "note": "cmc_price_required_for_sell",
            })
        else:
            quote = await PancakeRouterService.build_router_quote({
                **args,
                "symbol": symbol,
                "side": side,
                "amountUsd": amount_usd,
                "priceUsd": price_usd,
                "slippageBps": slippage_bps,
                "recipient": args.get("recipient") or wallet.get("walletAddress"),
            })
            stages.append({"stage": "quote", "state": "completed", "tool": "bnb_quote_trade", "note": quote["quoteSource"]})
        risk = RiskCheckService.run_risk_check(
            symbol=symbol,
            side=side,
            amount_usd=amount_usd,
            slippage_bps=slippage_bps,
            signal_source=signal_source,
            record_ledger=record_ledger,
        )
        trade_intent_id = str(risk.get("tradeIntentId") or trade_intent_id)
        stages.append({
            "stage": "decide",
            "state": "approved" if risk.get("approved") else "blocked",
            "tool": "bnb_risk_check",
            "note": ",".join(str(reason) for reason in risk.get("reasons", [])) or "guardrails_pass",
        })
        execution_args = {
            **args,
            "symbol": symbol,
            "side": side,
            "amountUsd": amount_usd,
            "slippageBps": slippage_bps,
            "signalSource": signal_source,
            "cmcSnapshot": cmc_snapshot,
            "tradeIntentId": trade_intent_id,
            "quote": quote,
            "transaction": quote.get("transaction"),
            "cmcAgentHubSignal": cmc_agent_hub_signal,
            "strategyDecision": strategy,
            "recipient": args.get("recipient") or wallet.get("walletAddress"),
        }
        live_cmc_blocker = CmcSignalConfigService.live_cmc_tool_blocker(
            execute and get_settings().bnb_trading_enabled,
            cmc_signal_tool,
            cmc_agent_hub_signal,
            symbol=symbol,
            side=side,
        )
        if live_cmc_blocker:
            execution = {
                "network": "bsc",
                "status": "blocked",
                "reason": live_cmc_blocker,
                "simulation": {"canExecute": False, "reason": live_cmc_blocker},
            }
        else:
            execution = await TradeExecutionService.execute_trade(execution_args) if execute else await TradeExecutionService.simulate_trade(execution_args)
        simulation = execution.get("simulation") if isinstance(execution.get("simulation"), dict) else {}
        can_execute = bool(simulation.get("canExecute")) if simulation else execution.get("status") == "submitted"
        stages.append({
            "stage": "sign",
            "state": "submitted" if execution.get("status") == "submitted" else ("ready" if can_execute else "blocked"),
            "tool": "bnb_execute_trade" if execute else "bnb_simulate_trade",
            "note": execution.get("reason") or simulation.get("reason") or "ready_for_twak",
        })
        return AutonomousCycleResponse.completed(
            trade_intent_id=trade_intent_id,
            started_at=started_at,
            symbol=symbol,
            side=side,
            amount_usd=amount_usd,
            execute=execute,
            stages=stages,
            cmc_agent_hub=cmc_agent_hub,
            cmc_agent_hub_signal=cmc_agent_hub_signal,
            cmc_snapshot=cmc_snapshot,
            strategy=strategy,
            quote=quote,
            risk=risk,
            execution=execution,
            can_execute=can_execute,
            record_ledger=record_ledger,
        )

    @staticmethod
    def price_usd_from_snapshot(snapshot: dict[str, object], symbol: str) -> object:
        symbols = snapshot.get("symbols") if isinstance(snapshot.get("symbols"), dict) else {}
        item = symbols.get(symbol.upper()) if isinstance(symbols, dict) else None
        return item.get("priceUsd") if isinstance(item, dict) else None
