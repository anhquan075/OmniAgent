from datetime import datetime, timezone

import httpx

from app.services.agent.status import BnbAgentStatusService
from app.services.wallet.balances import CapitalReadinessService
from app.services.cmc.prices import CmcPriceService
from app.services.shared.ledger import TradeLedger
from app.services.trading.policy import TradePolicyInput
from app.services.trading.policy import RiskPolicyService
from app.services.trading.proof_score import TradeProofScoreService
from app.services.trading.registration import CompetitionRegistrationService
from app.services.trading.recovery_candidates import TradeRecoveryCandidateService
from app.services.trading.trade_work_order import TradeWorkOrderService
from app.services.twak.bridge import TrustWalletBridge
from app.services.twak.config import TrustWalletConfigService
from app.services.twak.cli import TrustWalletCliClient
from app.services.twak.rest import TrustWalletRestClient
from app.services.wallet.agent_wallet import AgentWalletService
from app.services.wallet.x402 import X402PaymentService
class AgentCockpitService:
    @staticmethod
    async def get_cockpit_snapshot(limit: int = 10) -> dict[str, object]:
        wallet = AgentWalletService.get_wallet_data()
        ledger = TradeLedger.get_ledger_summary(limit=limit)
        sdk_status = BnbAgentStatusService.get_agent_sdk_status_dict()
        identity_proof = AgentCockpitService.latest_identity_proof(ledger)
        twak_status = await TrustWalletBridge.get_trust_wallet_status()
        competition_status = await AgentCockpitService.get_competition_status()
        paid_status = X402PaymentService.get_paid_resource_status(limit=10)
        capital = await CapitalReadinessService.get_capital_readiness(str(wallet.get("walletAddress") or ""))
        prices = await CmcPriceService.get_price_snapshot(["BNB", "CAKE", "TWT"])
        twak_ready = bool(wallet.get("twakReady")) and bool(twak_status.get("ready"))
        sdk_ready = bool(sdk_status.get("ready"))
        x402_ready = bool(paid_status.get("ready"))
        policy_status = RiskPolicyService.evaluate_trade_policy(TradePolicyInput(
            symbol="CAKE",
            side="buy",
            amount_usd=25,
            slippage_bps=50,
            signal_source="cmc" if prices.get("symbols") else None,
        ))
        latest_submission = TradeLedger.latest_trade_event("trade_executed")
        lifecycle = TradeWorkOrderService.from_proof_bundle(
            None,
            ledger,
            None,
            latest_submission,
        )
        proof_score = TradeProofScoreService.score(
            ledger=ledger,
            submission=latest_submission,
            twak_status=twak_status,
            competition=competition_status,
            prices=prices,
        )
        recovery = TradeRecoveryCandidateService.list_candidates(
            ledger=ledger,
            submission=latest_submission,
            twak_status=twak_status,
            competition=competition_status,
        )
        tools_used = [
            "bnb_agent_cockpit_snapshot",
            "cmc_agent_hub_status",
            "cmc_get_price_snapshot",
            "bnb_trade_ledger_summary",
            "bnb_agent_sdk_status",
            "bnb_get_wallet",
            "bnb_trust_wallet_status",
            "bnb_agent_sdk_register_identity",
            "bnb_paid_resource_status",
        ]
        return {
            "network": "bsc",
            "wallet": wallet,
            "twakStatus": twak_status,
            "sdkStatus": sdk_status,
            "paidStatus": paid_status,
            "prices": prices,
            "ledger": ledger,
            "passport": {
                "agent": "OmniAgent BNB Trader",
                "status": "armed" if twak_ready and sdk_ready and identity_proof["registered"] else "guarded",
                "checks": {
                    "cmc": bool(prices.get("configured")),
                    "twak": twak_ready,
                    "bnbAgentSdk": sdk_ready,
                    "identityProof": bool(identity_proof["registered"]),
                    "x402": x402_ready,
                },
                "identityProof": identity_proof,
            },
            "competition": AgentCockpitService.build_competition_readiness(wallet, ledger, capital, competition_status),
            "policyStatus": policy_status,
            "workOrders": {
                "network": "bsc",
                "lifecycle": lifecycle,
                "proofScore": proof_score,
                "workOrders": AgentCockpitService.build_work_orders(wallet, ledger, sdk_status, twak_status, prices),
            },
            "recovery": {"network": "bsc", "candidates": recovery},
            "toolsUsed": tools_used,
            "reasoning": AgentCockpitService.build_reasoning(wallet, prices, sdk_status, policy_status, twak_status),
            "updatedAt": datetime.now(timezone.utc).isoformat(),
        }

    @staticmethod
    def build_work_orders(
        wallet: dict[str, object],
        ledger: dict[str, object],
        sdk: dict[str, object],
        twak: dict[str, object],
        prices: dict[str, object],
    ) -> list[dict[str, object]]:
        identity_proof = AgentCockpitService.latest_identity_proof(ledger)
        return [
            {
                "stage": "sense",
                "state": "ready" if AgentCockpitService.cmc_signal_ready(prices) else "guarded",
                "label": "CMC signal intake",
            },
            {"stage": "decide", "state": "ready", "label": "Risk policy gate"},
            {
                "stage": "identity",
                "state": "verified" if identity_proof["registered"] else ("ready" if sdk.get("ready") else "guarded"),
                "label": "BNB SDK identity",
            },
            {"stage": "sign", "state": "ready" if twak.get("ready") else "guarded", "label": "TWAK local signing"},
            {"stage": "prove", "state": "ready" if (ledger.get("txEvents") or []) else "waiting", "label": "BSC tx proof"},
        ]

    @staticmethod
    def latest_identity_proof(ledger: dict[str, object]) -> dict[str, object]:
        events = ledger.get("events") or []
        registered_event = next(
            (
                event for event in events
                if isinstance(event, dict) and event.get("eventType") == "agent_registered"
            ),
            None,
        )
        payload = registered_event.get("payload") if isinstance(registered_event, dict) else {}
        payload = payload if isinstance(payload, dict) else {}
        return {
            "registered": bool(registered_event),
            "agentId": payload.get("agentId"),
            "agentWallet": payload.get("agentWallet"),
            "registryAddress": payload.get("registryAddress"),
            "transactionHash": payload.get("transactionHash") or (registered_event or {}).get("txHash") if isinstance(registered_event, dict) else None,
            "explorerUrl": payload.get("explorerUrl"),
        }

    @staticmethod
    def build_competition_readiness(
        wallet: dict[str, object],
        ledger: dict[str, object],
        capital: dict[str, object],
        competition_status: dict[str, object] | None = None,
    ) -> dict[str, object]:
        registered_event = CompetitionRegistrationService.stored_registration_proof(str(wallet.get("walletAddress") or ""))
        registration_proof = AgentCockpitService.build_registration_proof_summary(registered_event)
        trade_count = ((ledger.get("dailyCompliance") or {}).get("tradeCount")) or 0
        return {
            "track": "Track 1 Autonomous Trading Agents",
            "contractAddress": wallet.get("competitionContractAddress"),
            "registered": bool(registered_event),
            "registrationTxHash": (registered_event or {}).get("txHash") if isinstance(registered_event, dict) else None,
            "registrationProof": registration_proof,
            "registrationStatus": competition_status,
            "minimumTrades": 7,
            "tradeCount": trade_count,
            "dailyTradeProgress": f"{trade_count}/7",
            "requiresNonZeroInScopeAssets": True,
            "inScopeAssetCheck": capital.get("status"),
            "capital": capital,
            "registrationActions": ["twak compete register", "competition_register"],
        }

    @staticmethod
    def build_registration_proof_summary(event: dict[str, object] | None) -> dict[str, object] | None:
        if not isinstance(event, dict):
            return None
        payload = event.get("payload") if isinstance(event.get("payload"), dict) else {}
        tx_hash = str(event.get("txHash") or payload.get("txHash") or "")
        explorer_url = payload.get("explorerUrl")
        return {
            "source": "trade-ledger",
            "eventType": event.get("eventType"),
            "txHash": tx_hash,
            "explorerUrl": explorer_url or f"https://bscscan.com/tx/{tx_hash}",
            "walletAddress": payload.get("walletAddress"),
            "competitionContractAddress": payload.get("competitionContractAddress"),
            "chainId": payload.get("chainId"),
            "createdAt": event.get("createdAt"),
            "recordedAt": payload.get("timestamp"),
            "receiptProof": payload.get("receiptProof"),
        }

    @staticmethod
    async def get_competition_status() -> dict[str, object] | None:
        bridge = TrustWalletConfigService.get_trust_wallet_bridge_config()
        if bridge.mode == "rest" and bridge.base_url:
            try:
                status = await TrustWalletRestClient.call_rest_action(
                    bridge.base_url,
                    bridge.api_key,
                    bridge.hmac_secret,
                    "competition_status",
                    {},
                    bridge.timeout_ms / 1000,
                )
            except (httpx.HTTPError, ValueError, TypeError) as error:
                return {"ready": False, "registered": False, "reason": str(error)}
            return status if "_error" not in status else {"ready": False, "reason": status["_error"]}
        if bridge.mode == "cli":
            try:
                status = await TrustWalletCliClient.get_cli_competition_status(bridge.command, bridge.timeout_ms / 1000)
            except (RuntimeError, OSError, ValueError, TypeError) as error:
                return {"ready": False, "registered": False, "reason": str(error)}
            return status if "_error" not in status else {"ready": False, "reason": status["_error"]}
        return None

    @staticmethod
    def build_reasoning(
        wallet: dict[str, object],
        prices: dict[str, object],
        sdk: dict[str, object],
        policy: dict[str, object],
        twak: dict[str, object],
    ) -> list[str]:
        return [
            "Read BNB, CAKE, and TWT market snapshot from CoinMarketCap path." if AgentCockpitService.cmc_signal_ready(prices) else "CMC signal intake is blocked until a live CMC key returns prices.",
            "Keep execution guarded until SDK identity and TWAK wallet are both ready.",
            "Only allow Track 1 tokens and bounded trade size before any live signing.",
            f"Current blocker: {twak.get('reason') or wallet.get('twakReadinessReason') or sdk.get('reason') or ', '.join(policy.get('reasons', [])) or 'none'}",
        ]

    @staticmethod
    def cmc_signal_ready(prices: dict[str, object]) -> bool:
        if not prices.get("configured") or prices.get("reachable") is False:
            return False
        symbols = prices.get("symbols") if isinstance(prices.get("symbols"), dict) else {}
        return any(bool(item.get("priceUsd")) for item in symbols.values() if isinstance(item, dict))
