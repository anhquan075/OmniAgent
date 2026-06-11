from datetime import datetime, timezone
import re

from app.core.settings import get_settings
from app.services.cmc.prices import CmcPriceService
from app.services.cmc.signal_config import CmcSignalConfigService
from app.services.cmc.signal_evidence import CmcSignalEvidenceService
from app.services.cmc.signal_proof import CmcSignalProofService
from app.services.shared.ledger import TradeLedger
from app.services.trading.pancake import PancakeRouterService
from app.services.trading.policy import RiskPolicyService
from app.services.trading.registration_status import CompetitionRegistrationStatusService
from app.services.trading.token_registry import BNB_NATIVE_TOKEN_ADDRESS
from app.services.trading.token_registry import TokenRegistryService
from app.services.twak.bridge import TrustWalletBridge
from app.services.twak.config import TrustWalletConfigService
from app.services.twak.cli import TrustWalletCliClient
from app.services.twak.rest import TrustWalletRestClient
from app.services.wallet.agent_wallet import AgentWalletService

TX_RE = re.compile(r"^0x[a-fA-F0-9]{64}$")
class TradeExecutionService:
    @staticmethod
    async def simulate_trade(args: dict[str, object]) -> dict[str, object]:
        wallet = AgentWalletService.get_wallet_data()
        quote = args.get("quote") if isinstance(args.get("quote"), dict) else None
        transaction = args.get("transaction") if isinstance(args.get("transaction"), dict) else None
        if transaction is None and quote is None and "symbol" in args:
            quote = await PancakeRouterService.build_router_quote(args)
        if transaction is None and isinstance(quote, dict):
            transaction = quote.get("transaction") if isinstance(quote.get("transaction"), dict) else None
        policy = RiskPolicyService.evaluate_trade_policy(RiskPolicyService.policy_input_from_args(args))
        twak_status = await TrustWalletBridge.get_trust_wallet_status()
        cmc_snapshot = args.get("cmcSnapshot") if isinstance(args.get("cmcSnapshot"), dict) else None
        if cmc_snapshot is None and "symbol" in args:
            cmc_snapshot = await CmcPriceService.get_price_snapshot([str(args.get("symbol") or "CAKE")])
        cmc_agent_hub_signal = args.get("cmcAgentHubSignal")
        signal_payload = cmc_agent_hub_signal if isinstance(cmc_agent_hub_signal, dict) else None
        wallet_address = str(wallet.get("walletAddress") or "")
        competition_status = None
        if (
            get_settings().bnb_trading_enabled
            and wallet_address
            and TradeExecutionService.cmc_tool_blocker(policy, signal_payload) is None
        ):
            competition_status = await CompetitionRegistrationStatusService.get_competition_status(wallet_address)
        reasons = TradeExecutionService.execution_blockers(
            transaction,
            policy,
            twak_status,
            cmc_snapshot,
            signal_payload,
            competition_status,
        )
        can_execute = not reasons
        return {
            "network": "bsc",
            "tradeIntentId": args.get("tradeIntentId"),
            "simulation": {
                "canExecute": can_execute,
                "reason": None if can_execute else "; ".join(reasons),
                "walletAddress": wallet.get("walletAddress"),
                "quote": quote,
                "transaction": transaction,
                "policy": policy,
                "cmcSnapshot": cmc_snapshot,
                "twakStatus": twak_status,
            },
        }

    @staticmethod
    async def execute_trade(args: dict[str, object]) -> dict[str, object]:
        args = await CmcSignalProofService.with_server_cmc_agent_hub_signal(args)
        execution_args = TradeExecutionService.server_execution_args(args)
        simulation = await TradeExecutionService.simulate_trade(execution_args)
        sim = simulation["simulation"]
        if not sim["canExecute"]:
            TradeLedger.append_event({
                "eventType": "trade_blocked",
                "tradeIntentId": execution_args.get("tradeIntentId"),
                "action": "execute_trade",
                "payload": {"reason": sim["reason"], "simulation": sim},
                "createdAt": datetime.now(timezone.utc).isoformat(),
            })
            return {**simulation, "status": "blocked"}

        bridge = TrustWalletConfigService.get_trust_wallet_bridge_config()
        if bridge.mode == "rest":
            payload = await TradeExecutionService.execute_via_rest(bridge, execution_args, sim)
        elif bridge.mode == "cli":
            payload = await TradeExecutionService.execute_via_cli(bridge.command, execution_args, sim)
        else:
            return {**simulation, "status": "blocked", "reason": "TWAK REST or CLI bridge is required for live execution"}
        tx_hash = payload.get("txHash") or payload.get("hash")
        tx_hash = tx_hash or TrustWalletCliClient.find_tx_hash(payload)
        if not tx_hash or not TX_RE.match(str(tx_hash)):
            raise ValueError("TWAK execution did not return a txHash.")
        return CmcSignalEvidenceService.submitted_trade_result(execution_args, sim, tx_hash, bridge.mode)

    @staticmethod
    def server_execution_args(args: dict[str, object]) -> dict[str, object]:
        return {
            key: value
            for key, value in args.items()
            if key not in {"quote", "transaction"}
        }

    @staticmethod
    async def execute_via_rest(bridge: object, args: dict[str, object], simulation: dict[str, object]) -> dict[str, object]:
        if not bridge.base_url:
            raise ValueError("TRUST_WALLET_AGENT_KIT_CONFIG must include baseUrl for TWAK REST execution.")
        payload = await TrustWalletRestClient.call_rest_action(
            bridge.base_url,
            bridge.api_key,
            bridge.hmac_secret,
            "swap",
            TradeExecutionService.rest_swap_args(args, simulation),
            bridge.timeout_ms / 1000,
        )
        if payload.get("_error") or payload.get("success") is False:
            raise ValueError(str(payload.get("_error") or payload.get("message") or "TWAK REST swap failed"))
        return payload

    @staticmethod
    async def execute_via_cli(command: str, args: dict[str, object], simulation: dict[str, object]) -> dict[str, object]:
        quote = simulation.get("quote") if isinstance(simulation.get("quote"), dict) else {}
        from_token = TradeExecutionService.twak_token_arg(str(quote.get("inputTokenAddress") or quote.get("inputSymbol") or "USDT"))
        to_token = TradeExecutionService.twak_token_arg(str(quote.get("outputTokenAddress") or quote.get("outputSymbol") or args.get("symbol") or "CAKE"))
        payload = await TrustWalletCliClient.execute_cli_swap(
            command=command,
            amount_usd=float(args.get("amountUsd") or 25),
            from_token=from_token,
            to_token=to_token,
            slippage_bps=int(args.get("slippageBps") or 50),
        )
        if payload.get("_error"):
            raise ValueError(str(payload["_error"]))
        return payload

    @staticmethod
    def twak_token_arg(value: str) -> str:
        return "BNB" if value == BNB_NATIVE_TOKEN_ADDRESS else value

    @staticmethod
    def rest_swap_args(args: dict[str, object], simulation: dict[str, object]) -> dict[str, object]:
        quote = simulation.get("quote") if isinstance(simulation.get("quote"), dict) else {}
        TradeExecutionService.validate_router_quote(quote)
        return {
            "fromChain": "bsc",
            "toChain": "bsc",
            "fromToken": TradeExecutionService.twak_token_arg(str(quote.get("inputTokenAddress") or quote.get("inputSymbol") or "USDT")),
            "toToken": TradeExecutionService.twak_token_arg(str(quote.get("outputTokenAddress") or quote.get("outputSymbol") or args.get("symbol") or "CAKE")),
            "amount": TradeExecutionService.rest_input_amount(args, quote),
            "slippage": f"{int(args.get('slippageBps') or quote.get('slippageBps') or 50) / 100:.2f}",
        }

    @staticmethod
    def rest_input_amount(args: dict[str, object], quote: dict[str, object]) -> str:
        input_symbol = str(quote.get("inputSymbol") or "USDT")
        if input_symbol == "USDT":
            return str(args.get("amountUsd") or quote.get("amountUsd") or 25)
        token = TokenRegistryService.get_token(input_symbol)
        if not token:
            return str(args.get("amount") or 0)
        amount_raw = int(str(quote.get("amountInRaw") or "0"))
        return format(amount_raw / (10 ** token.decimals), "f")

    @staticmethod
    def validate_router_quote(quote: dict[str, object]) -> None:
        for key in ("inputTokenAddress", "outputTokenAddress"):
            token = TokenRegistryService.get_token_by_address(str(quote.get(key) or ""))
            if not token or not TokenRegistryService.is_token_allowed(token.symbol):
                raise ValueError(f"Router quote {key} is not in the BSC allowlist.")

    @staticmethod
    def execution_blockers(
        transaction: dict[str, object] | None,
        policy: dict[str, object],
        twak_status: dict[str, object] | None = None,
        cmc_snapshot: dict[str, object] | None = None,
        cmc_agent_hub_signal: dict[str, object] | None = None,
        competition_status: dict[str, object] | None = None,
    ) -> list[str]:
        settings = get_settings()
        wallet = AgentWalletService.get_wallet_data()
        reasons: list[str] = []
        if not wallet.get("walletAddress"):
            reasons.append("agent wallet is not configured")
        if not wallet.get("twakReady"):
            reasons.append(str(wallet.get("twakReadinessReason") or "TWAK is not ready"))
        if wallet.get("twakReady") and twak_status and not twak_status.get("ready"):
            reasons.append(str(twak_status.get("reason") or "TWAK live surface is not validated"))
        if not settings.bnb_trading_enabled:
            reasons.append("BNB live trading is disabled")
        if not settings.allow_agent_run:
            reasons.append("ALLOW_AGENT_RUN is false")
        cmc_tool_blocker = TradeExecutionService.cmc_tool_blocker(policy, cmc_agent_hub_signal)
        if settings.bnb_trading_enabled and not cmc_tool_blocker and not TradeExecutionService.competition_registered(
            str(wallet.get("walletAddress") or ""),
            competition_status,
        ):
            reasons.append("competition registration proof is required before live execution")
        if settings.bnb_trading_enabled and not TradeExecutionService.cmc_signal_ready(cmc_snapshot):
            reasons.append("CMC live signal is required")
        if cmc_tool_blocker:
            reasons.append(cmc_tool_blocker)
        if not policy.get("approved"):
            reasons.extend(str(reason) for reason in policy.get("reasons", []))
        if not transaction:
            reasons.append("router-backed transaction is required")
        elif int(transaction.get("chainId") or 0) != settings.bnb_chain_id:
            reasons.append("transaction chainId must be BSC mainnet")
        return reasons

    @staticmethod
    def cmc_signal_ready(snapshot: dict[str, object] | None) -> bool:
        if not snapshot:
            return False
        if not snapshot.get("configured") or snapshot.get("reachable") is False:
            return False
        symbols = snapshot.get("symbols") if isinstance(snapshot.get("symbols"), dict) else {}
        return any(bool((item or {}).get("priceUsd")) for item in symbols.values() if isinstance(item, dict))

    @staticmethod
    def cmc_tool_blocker(
        policy: dict[str, object],
        cmc_agent_hub_signal: dict[str, object] | None,
    ) -> str | None:
        policy_observed = policy.get("observed") if isinstance(policy.get("observed"), dict) else {}
        return CmcSignalConfigService.live_cmc_tool_blocker(
            get_settings().bnb_trading_enabled,
            str(cmc_agent_hub_signal.get("toolName") or "") if cmc_agent_hub_signal else None,
            cmc_agent_hub_signal,
            symbol=str(policy_observed.get("symbol") or ""),
            side=str(policy_observed.get("side") or ""),
        )

    @staticmethod
    def competition_registered(
        wallet_address: str | None = None,
        competition_status: dict[str, object] | None = None,
    ) -> bool:
        return CompetitionRegistrationStatusService.is_registered(wallet_address, competition_status)
