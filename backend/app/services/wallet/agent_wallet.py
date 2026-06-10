from app.core.settings import get_settings
from app.services.twak.cli import TrustWalletCliClient
from app.services.wallet.url_safety import redact_url

class AgentWalletService:
    @staticmethod
    def get_wallet_data() -> dict[str, object]:
        settings = get_settings()
        twak_mode = settings.trust_wallet_agent_kit_mode
        wallet_address = settings.agent_wallet or AgentWalletService.cli_wallet_address(twak_mode)
        twak_enabled = twak_mode != "disabled"
        wallet_bound = bool(wallet_address and twak_enabled)
        reason = None
        if not wallet_address:
            reason = "Agent wallet address is not configured"
        elif not twak_enabled:
            reason = "Trust Wallet Agent Kit is disabled"
        return {
            "network": "bsc",
            "chainId": settings.bnb_chain_id,
            "explorerUrl": settings.bnb_explorer_url,
            "rpcUrl": redact_url(settings.bnb_rpc_url),
            "walletMode": "agent",
            "walletAddress": wallet_address,
            "competitionContractAddress": settings.bnb_competition_contract_address,
            "tradingEnabled": settings.bnb_trading_enabled,
            "allowAgentRun": settings.allow_agent_run,
            "twakReady": wallet_bound,
            "twakReadinessReason": reason,
            "twakServer": {
                "mode": twak_mode,
                "enabled": twak_enabled,
                "walletBound": wallet_bound,
                "state": "bound" if wallet_bound else "dry-run",
            },
        }

    @staticmethod
    def cli_wallet_address(twak_mode: str) -> str | None:
        if twak_mode != "cli":
            return None
        return TrustWalletCliClient.get_cli_wallet_address()
