from functools import lru_cache
import os
from pathlib import Path

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

    port: int = 8000
    api_session_secret: str = "local-development-session-secret-change-me"
    api_operator_token: str | None = None
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
    agent_runtime_adapter: str = "fastapi-casper-agent"
    mcp_allowed_tools: str = (
        "casper_agent_cockpit_snapshot,casper_get_account,casper_runtime_snapshot,"
        "casper_live_preflight,casper_run_autonomous_cycle,casper_live_proof_bundle,"
        "casper_get_deploy_status,casper_get_decision_receipt,"
        "casper_verify_decision_receipt,casper_record_decision,casper_record_readback"
    )

    casper_network: str = "casper-test"
    casper_rpc_url: str = "https://node.testnet.casper.network/rpc"
    casper_node_address: str | None = None
    casper_rpc_timeout_sec: float = 10.0
    casper_explorer_url: str = "https://testnet.cspr.live"
    casper_account_public_key: str | None = None
    casper_secret_key_path: str | None = None
    casper_contract_install_deploy_hash: str | None = None
    casper_decision_contract_hash: str | None = None
    casper_decision_contract_package_hash: str | None = None
    casper_live_submit_enabled: bool = False
    casper_client_path: str = "casper-client"
    casper_transaction_command: str = "put-deploy"
    casper_transaction_wasm_path: str | None = None
    casper_transaction_entry_point: str = "record_decision"
    casper_transaction_category: str = "small"
    casper_gas_price_tolerance: int = 10
    casper_pricing_mode: str = "fixed"
    casper_payment_amount_motes: int = 25_000_000_000
    casper_cli_timeout_sec: float = 30.0
    casper_agent_public_endpoint: str = "/.well-known/casper-agent-card.json"
    casper_decision_ledger_path: Path = BACKEND_ROOT / "data" / "casper-decision-log"
    casper_x402_evidence_url: str | None = None
    casper_x402_receipt: str | None = None
    casper_x402_facilitator_url: str = "https://x402.org/facilitator"
    casper_x402_network: str = "eip155:84532"
    casper_x402_price: str = "$0.001"
    casper_x402_currency: str = "USDC"
    casper_x402_pay_to_address: str | None = None
    casper_llm_trace_enabled: bool = False
    casper_llm_trace_provider: str = "openrouter"
    casper_llm_trace_model: str = "deepseek/deepseek-v4-flash"
    casper_llm_trace_capture: str | None = None
    openrouter_api_key: str | None = None
    openrouter_model: str = "deepseek/deepseek-v4-flash"
    openrouter_fallback_model: str | None = "deepseek/deepseek-v4-pro"
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    openrouter_site_url: str | None = None
    openrouter_app_title: str = "OmniAgent Casper Demo"
    openrouter_timeout_sec: float = 10.0
    casper_agent_loop_enabled: bool = True
    casper_agent_loop_interval_sec: int = 60
    casper_agent_loop_dry_run: bool = False
    casper_agent_loop_cycle_timeout_sec: float = 45.0
    casper_agent_loop_auto_readback: bool = True
    casper_agent_loop_poll_max_retries: int = 10
    casper_agent_loop_poll_interval_sec: float = 5.0
    casper_ledger_max_events: int = 500
    casper_cspr_cloud_api_key: str | None = None
    casper_cspr_cloud_url: str = "https://api.testnet.cspr.cloud"
    casper_min_balance_cspr: float = 50.0

    @property
    def origins(self) -> list[str]:
        return [item.strip() for item in self.allowed_frontend_origins.split(",") if item.strip()]

    @property
    def trusted_hosts(self) -> set[str]:
        return {item.strip().lower() for item in self.api_trusted_hosts.split(",") if item.strip()}

    @property
    def allowed_tools(self) -> set[str]:
        return {item.strip() for item in self.mcp_allowed_tools.split(",") if item.strip()}


@lru_cache
def get_settings() -> Settings:
    return Settings()
