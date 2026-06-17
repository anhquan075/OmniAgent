from functools import lru_cache
import os
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


BACKEND_ROOT = Path(__file__).resolve().parents[2]
REPO_ROOT = BACKEND_ROOT.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=()
        if os.getenv("OMNIAGENT_SKIP_ENV_FILE") == "true"
        else (REPO_ROOT / ".env", BACKEND_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    port: int = Field(default=8000, alias="PORT")
    api_session_secret: str = Field(default="local-development-session-secret-change-me")
    api_operator_token: str | None = Field(default=None, alias="API_OPERATOR_TOKEN")
    api_session_ttl_ms: int = 1_800_000
    api_security_enabled: bool = True
    api_security_headers_enabled: bool = True
    api_rate_limit_enabled: bool = True
    api_rate_limit_requests: int = 600
    api_mcp_rate_limit_requests: int = 240
    api_session_rate_limit_requests: int = 180
    api_rate_limit_window_sec: int = 60
    api_max_body_bytes: int = 1_048_576
    api_trusted_hosts: str = (
        "localhost,127.0.0.1,testserver,healthcheck.railway.app,"
        "*.up.railway.app,*.railway.internal"
    )
    allowed_frontend_origins: str = (
        "http://localhost:5173,http://127.0.0.1:5173,"
        "http://localhost:3000,http://127.0.0.1:3000"
    )
    mcp_allowed_tools: str = (
        "bnb_agent_cockpit_snapshot,bnb_get_wallet,bnb_trust_wallet_status,bnb_agent_sdk_status,"
        "bnb_agent_sdk_register_identity,"
        "bnb_agent_runtime_snapshot,bnb_ledger_memory,bnb_strategy_research,bnb_backtest_report,"
        "bnb_paid_resource_status,bnb_record_paid_signal_access,"
        "cmc_agent_hub_status,cmc_agent_hub_recommend_signal_tools,cmc_agent_hub_call_tool,"
        "cmc_skill_hub_status,cmc_skill_hub_find_skill,cmc_skill_hub_execute_skill,"
        "cmc_skill_prompt_catalog,cmc_daily_market_overview,"
        "cmc_get_price_snapshot,"
        "bnb_trade_ledger_summary,bnb_quote_trade,bnb_risk_check,"
        "bnb_simulate_trade,bnb_execute_trade,bnb_run_autonomous_cycle,bnb_live_preflight,bnb_get_trade_status,"
        "bnb_import_trade_proof,"
        "bnb_live_proof_bundle,bnb_competition_register,bnb_emergency_pause"
    )
    agent_runtime_adapter: str = "fastapi-bnb-agent"
    bnb_autonomous_loop_enabled: bool = False
    bnb_autonomous_loop_execute: bool = False
    bnb_autonomous_loop_interval_sec: int = 300
    bnb_autonomous_loop_initial_delay_sec: int = 5
    bnb_autonomous_loop_symbol: str = "CAKE"
    bnb_autonomous_loop_side: str = "buy"
    bnb_autonomous_loop_amount_usd: float = 25.0
    bnb_autonomous_loop_slippage_bps: int = 50
    bnb_strategy_advisor_enabled: bool = True
    bnb_strategy_require_llm_for_live: bool = False
    bnb_strategy_min_confidence: float = 0.62
    bnb_strategy_max_position_pct: float = 0.35
    bnb_trading_enabled: bool = False
    allow_agent_run: bool = False
    bnb_max_trade_usd: float = 25.0
    bnb_max_slippage_bps: int = 100
    bnb_max_drawdown_pct: float = 30.0
    bnb_max_daily_trades: int = 12
    bnb_min_gas_reserve_wei: int = 500_000_000_000_000
    bnb_chain_id: int = 56
    bnb_explorer_url: str = "https://bscscan.com"
    bnb_rpc_url: str = "https://bsc-dataseed.bnbchain.org"
    bnb_rpc_tls_verify: bool = True
    bnb_competition_contract_address: str = "0x212c61b9b72c95d95bf29cf032f5e5635629aed5"
    bnb_pancake_swap_router_address: str = "0x10ED43C718714eb63d5aA57B78B54704E256024E"
    bnb_competition_registration_enabled: bool = False
    bnb_bundled_registration_proof_enabled: bool = False
    bnb_agent_sdk_enabled: bool = False
    bnb_agent_sdk_registration_enabled: bool = False
    bnb_agent_sdk_network: str = "bsc-mainnet"
    bnb_agent_public_endpoint: str = "https://omniagent.example/.well-known/agent-card.json"
    bnb_token_allowlist: str = "BNB,USDT,USDC,CAKE,TWT"
    private_key: str | None = Field(default=None, alias="PRIVATE_KEY")
    wallet_password: str | None = Field(default=None, alias="WALLET_PASSWORD")
    trust_wallet_agent_kit_mode: str = "disabled"
    trust_wallet_agent_kit_config: str | None = None
    trust_wallet_agent_kit_base_url: str | None = None
    trust_wallet_agent_kit_api_key: str | None = None
    trust_wallet_agent_kit_timeout_ms: int | None = None
    trust_wallet_agent_kit_command: str | None = None
    tw_access_id: str | None = None
    tw_hmac_secret: str | None = None
    twak_agent_wallet: str | None = None
    robot_fleet_agent_wallet: str | None = None
    cmc_agent_hub_api_key: str | None = None
    cmc_skill_hub_api_key: str | None = None
    cmc_mcp_api_key: str | None = None
    cmc_pro_api_key: str | None = None
    coinmarketcap_api_key: str | None = None
    x_cmc_pro_api_key: str | None = None
    cmc_agent_hub_base_url: str = "https://pro-api.coinmarketcap.com"
    cmc_mcp_url: str = "https://mcp.coinmarketcap.com/mcp"
    cmc_skill_hub_mcp_url: str = "https://mcp.coinmarketcap.com/skill-hub/stream"
    cmc_skill_hub_tool_timeout_sec: int = 300
    cmc_quota_cooldown_sec: int = 3600
    cmc_price_cache_ttl_sec: int = 90
    cmc_agent_hub_status_cache_ttl_sec: int = 900
    cmc_agent_hub_signal_cache_ttl_sec: int = 120
    cmc_agent_hub_signal_tool: str | None = None
    cmc_agent_hub_signal_args: str | None = None
    openrouter_api_key: str | None = None
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    openrouter_model: str = "deepseek/deepseek-v4-pro"
    openrouter_fallback_model: str = "deepseek/deepseek-v4-flash"
    openrouter_site_url: str | None = None
    openrouter_app_name: str = "OmniAgent BNB Trading Agent"
    x402_facilitator_url: str | None = None
    x402_network: str = "eip155:56"
    x402_payment_verifier_url: str | None = None
    robot_fleet_x402_enabled: bool = False
    trade_ledger_path: Path = BACKEND_ROOT / "data" / "trade-ledger.jsonl"

    @property
    def origins(self) -> list[str]:
        return [item.strip() for item in self.allowed_frontend_origins.split(",") if item.strip()]

    @property
    def trusted_hosts(self) -> set[str]:
        return {item.strip().lower() for item in self.api_trusted_hosts.split(",") if item.strip()}

    @property
    def allowed_tools(self) -> set[str]:
        return {item.strip() for item in self.mcp_allowed_tools.split(",") if item.strip()}

    @property
    def token_allowlist(self) -> set[str]:
        return {item.strip().upper() for item in self.bnb_token_allowlist.split(",") if item.strip()}

    @property
    def agent_wallet(self) -> str | None:
        return self.twak_agent_wallet or self.robot_fleet_agent_wallet

    @property
    def cmc_api_key(self) -> str | None:
        return (
            self.cmc_agent_hub_api_key
            or self.cmc_mcp_api_key
            or self.cmc_pro_api_key
            or self.coinmarketcap_api_key
            or self.x_cmc_pro_api_key
        )

    @property
    def cmc_skill_hub_key(self) -> str | None:
        return self.cmc_skill_hub_api_key or self.cmc_mcp_api_key or self.cmc_agent_hub_api_key


@lru_cache
def get_settings() -> Settings:
    return Settings()
