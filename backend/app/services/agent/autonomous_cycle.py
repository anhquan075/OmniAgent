from datetime import datetime, timezone
from uuid import uuid4

from app.core.settings import get_settings
from app.services.trading.execution import TradeExecutionService
from app.services.cmc.prices import CmcPriceService
from app.services.cmc.agent_hub import CmcAgentHubClient
from app.services.cmc.agent_hub_tools import CmcAgentHubToolClient
from app.services.cmc.signal_config import CmcSignalConfigService
from app.services.shared.ledger import TradeLedger
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
        cmc_signal_tool, cmc_signal_args, cmc_signal_reason, cmc_signal_resolution = await CmcSignalConfigService.resolved_cmc_signal_config(
            args,
            symbol=symbol,
            side=side,
            amount_usd=amount_usd,
        )
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
        cmc_agent_hub = await CmcAgentHubClient.get_cmc_agent_hub_status()
        cmc_snapshot = await CmcPriceService.get_price_snapshot([symbol, "BNB"])
        cmc_ready = (
            bool(cmc_agent_hub.get("ready"))
            and bool(cmc_snapshot.get("configured"))
            and cmc_snapshot.get("reachable") is not False
        )
        stages[0] = {
            "stage": "sense",
            "state": "completed" if cmc_ready else "blocked",
            "tool": "cmc_agent_hub_status",
            "note": "cmc_agent_hub_ready" if cmc_agent_hub.get("ready") else str(
                cmc_agent_hub.get("reason") or "cmc_agent_hub_unavailable"
            ),
        }
        stages.append({
            "stage": "sense_price",
            "state": "completed" if cmc_ready else "blocked",
            "tool": "cmc_get_price_snapshot",
            "note": "cmc_live_signal" if cmc_ready else str(cmc_snapshot.get("reason") or "cmc_unavailable"),
        })
        cmc_agent_hub_signal: dict[str, object] | None = None
        if cmc_signal_tool:
            cmc_agent_hub_signal = await CmcAgentHubToolClient.call_cmc_agent_hub_tool({
                "toolName": cmc_signal_tool,
                "arguments": cmc_signal_args,
            })
            cmc_agent_hub_signal = {**cmc_agent_hub_signal, "resolution": cmc_signal_resolution}
            stages.append({
                "stage": "sense_agent_hub",
                "state": "completed" if cmc_agent_hub_signal.get("ready") else "blocked",
                "tool": "cmc_agent_hub_call_tool",
                "note": "cmc_agent_hub_tool_ready" if cmc_agent_hub_signal.get("ready") else str(
                    cmc_agent_hub_signal.get("reason") or "cmc_agent_hub_tool_unavailable"
                ),
            })
        elif execute:
            stages.append({
                "stage": "sense_agent_hub",
                "state": "blocked",
                "tool": "cmc_agent_hub_call_tool",
                "note": cmc_signal_reason or "cmc_agent_hub_tool_required_for_live_execution",
            })
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
            "recipient": args.get("recipient") or wallet.get("walletAddress"),
        }
        live_cmc_blocker = CmcSignalConfigService.live_cmc_tool_blocker(
            execute and get_settings().bnb_trading_enabled,
            cmc_signal_tool,
            cmc_agent_hub_signal,
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
        event = {
            "eventType": "autonomous_cycle_completed",
            "tradeIntentId": trade_intent_id,
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "payload": {
                "symbol": symbol,
                "side": side,
                "amountUsd": amount_usd,
                "execute": execute,
                "stages": stages,
                "status": execution.get("status") or ("ready" if can_execute else "blocked"),
            },
        }
        if record_ledger:
            event = TradeLedger.append_event(event)
        return {
            "network": "bsc",
            "tradeIntentId": trade_intent_id,
            "startedAt": started_at,
            "completedAt": event["createdAt"],
            "mode": "execute" if execute else "dry_run",
            "status": execution.get("status") or ("ready" if can_execute else "blocked"),
            "toolsUsed": [
                "cmc_agent_hub_status",
                "cmc_get_price_snapshot",
                *(["cmc_agent_hub_call_tool"] if cmc_agent_hub_signal else []),
                "bnb_quote_trade",
                "bnb_risk_check",
                "bnb_execute_trade" if execute else "bnb_simulate_trade",
            ],
            "stages": stages,
            "cmcAgentHub": cmc_agent_hub,
            "cmcAgentHubSignal": cmc_agent_hub_signal,
            "cmcSnapshot": cmc_snapshot,
            "quote": quote,
            "risk": risk,
            "execution": execution,
            **({"ledgerEvent": event} if record_ledger else {}),
        }

    @staticmethod
    def price_usd_from_snapshot(snapshot: dict[str, object], symbol: str) -> object:
        symbols = snapshot.get("symbols") if isinstance(snapshot.get("symbols"), dict) else {}
        item = symbols.get(symbol.upper()) if isinstance(symbols, dict) else None
        return item.get("priceUsd") if isinstance(item, dict) else None
