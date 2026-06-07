from pathlib import Path
from types import SimpleNamespace
import asyncio
import json
import importlib.util
import sys


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "check-bnb-mainnet-readiness.py"
CONFIG_SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "configure-bnb-live-env.py"
LIVE_CYCLE_SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "run-bnb-live-cycle.py"
LIVE_LOOP_SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "run-bnb-live-loop.py"
CMC_PROOF_SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "prove-cmc-agent-hub-live.py"
RECORD_REGISTRATION_SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "record-bnb-competition-registration.py"
SCRIPTS_DIR = SCRIPT.parent


def load_script_module(path: Path = SCRIPT, name: str = "check_bnb_mainnet_readiness"):
    if str(SCRIPTS_DIR) not in sys.path:
        sys.path.insert(0, str(SCRIPTS_DIR))
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise AssertionError("Unable to load readiness script")
    module = importlib.util.module_from_spec(spec)
    sys.modules[str(spec.name)] = module
    spec.loader.exec_module(module)
    return module


def test_missing_cmc_agent_hub_signal_tool_is_error_in_live_mode() -> None:
    module = load_script_module()
    result = module.preflight_signal_check(None, live=True)
    assert result.ok is False
    assert result.severity == "error"


def test_missing_cmc_agent_hub_signal_tool_is_warning_in_dry_run() -> None:
    module = load_script_module()
    result = module.preflight_signal_check(None, live=False)
    assert result.ok is True
    assert result.severity == "warn"


def test_dry_readiness_counts_nonfatal_signal_warning(monkeypatch) -> None:
    module = load_script_module()
    calls: list[tuple[str, tuple[object, ...]]] = []

    class FakeClient:
        def __init__(self, api_url: str) -> None:
            self.api_url = api_url

        async def health(self) -> dict[str, object]:
            return {"status": "ok"}

        async def tool(self, name: str, args: dict[str, object], timeout: int = 90) -> dict[str, object]:
            return {"cmcAgentHubSignal": {"ready": False, "reason": "tool missing"}, "blockers": []}

    class FakeLogger:
        def success(self, *args: object) -> None:
            calls.append(("success", args))

        def warning(self, *args: object) -> None:
            calls.append(("warning", args))

        def error(self, *args: object) -> None:
            calls.append(("error", args))

        def info(self, *args: object) -> None:
            calls.append(("info", args))

    monkeypatch.setattr(module, "ApiClient", FakeClient)
    monkeypatch.setattr(module, "logger", FakeLogger())

    result = asyncio.run(module.run(SimpleNamespace(api_url="http://127.0.0.1:8000", live=False)))

    assert result == 0
    assert any(name == "warning" and args[0] == "{}: {}" for name, args in calls)
    assert ("info", ("readiness summary: {} errors, {} warnings", 0, 1)) in calls


def test_live_flags_are_warning_in_dry_run_and_error_in_live_mode() -> None:
    module = load_script_module()
    payload = {
        "cmcAgentHubSignal": {"ready": True},
        "blockers": [
            {
                "name": "live_flags",
                "requiredBeforeEnable": False,
                "requiredForLiveTrade": True,
                "reason": "Set BNB_TRADING_ENABLED=true and ALLOW_AGENT_RUN=true.",
            }
        ],
    }

    dry_result = module.summarize_preflight(payload, live=False)
    live_result = module.summarize_preflight(payload, live=True)

    assert next(item for item in dry_result if item.name == "live_flags").severity == "warn"
    assert next(item for item in live_result if item.name == "live_flags").severity == "error"


def test_configure_live_env_allows_auto_discovered_cmc_signal_tool(monkeypatch, tmp_path) -> None:
    module = load_script_module(CONFIG_SCRIPT, "configure_bnb_live_env")
    env_path = tmp_path / ".env"
    monkeypatch.setenv("CMC_AGENT_HUB_API_KEY", "test-key")
    monkeypatch.setattr(sys, "argv", ["configure-bnb-live-env.py", "--enable-live", "--env", str(env_path)])
    assert module.main() == 0
    values = module.parse_env(env_path)
    assert values["BNB_TRADING_ENABLED"] == "true"
    assert values["ALLOW_AGENT_RUN"] == "true"
    assert "CMC_AGENT_HUB_SIGNAL_TOOL" not in values


def test_live_cycle_submission_signal_falls_back_to_cycle_payload() -> None:
    module = load_script_module(LIVE_CYCLE_SCRIPT, "run_bnb_live_cycle")
    result = {"cmcAgentHubSignal": {"toolName": "crypto.signal.auto", "serverVerified": True}}
    status = {"status": "pending"}
    assert module.submission_signal(result, status)["toolName"] == "crypto.signal.auto"


def test_live_loop_submission_signal_falls_back_to_cycle_payload() -> None:
    module = load_script_module(LIVE_LOOP_SCRIPT, "run_bnb_live_loop")
    result = {"cmcAgentHubSignal": {"toolName": "crypto.signal.auto", "serverVerified": True}}
    status = {"status": "pending"}
    assert module.submission_signal(result, status)["serverVerified"] is True


def test_cmc_proof_script_requires_prices() -> None:
    module = load_script_module(CMC_PROOF_SCRIPT, "prove_cmc_agent_hub_live")
    try:
        module.require_prices({"configured": True, "reachable": True, "symbols": {}}, ["BNB"])
    except ValueError as error:
        assert "missing prices" in str(error)
    else:
        raise AssertionError("missing prices must fail")


def test_cmc_proof_script_preflight_args_uses_auto_discovery() -> None:
    module = load_script_module(CMC_PROOF_SCRIPT, "prove_cmc_agent_hub_live")
    assert module.preflight_args("", {"symbol": "BNB"}) == {}


def test_record_registration_script_writes_valid_ledger_event(monkeypatch, tmp_path) -> None:
    from app.core.settings import get_settings

    module = load_script_module(RECORD_REGISTRATION_SCRIPT, "record_bnb_competition_registration")
    ledger_path = tmp_path / "ledger.jsonl"
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(ledger_path))
    monkeypatch.setenv("ROBOT_FLEET_AGENT_WALLET", "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25")
    get_settings.cache_clear()

    result = module.run(SimpleNamespace(
        tx_hash="0x" + "b" * 64,
        wallet_address="",
        metadata_uri="ipfs://omniagent",
        bridge_mode="manual-twak-cli",
    ))

    assert result == 0
    event = json.loads(ledger_path.read_text(encoding="utf-8"))
    assert event["eventType"] == "competition_registered"
    assert event["txHash"] == "0x" + "b" * 64
    assert event["payload"]["txHash"] == "0x" + "b" * 64
    assert event["payload"]["submitted"] is True
    assert event["payload"]["status"] == "submitted"
    assert event["payload"]["chainId"] == 56
    assert event["payload"]["walletAddress"] == "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25"
    assert event["payload"]["competitionContractAddress"] == "0x212c61b9b72c95d95bf29cf032f5e5635629aed5"
    assert event["payload"]["explorerUrl"] == "https://bscscan.com/tx/" + "0x" + "b" * 64
    get_settings.cache_clear()


def test_record_registration_script_rejects_invalid_tx_hash(monkeypatch, tmp_path) -> None:
    from app.core.settings import get_settings

    module = load_script_module(RECORD_REGISTRATION_SCRIPT, "record_bnb_competition_registration_invalid")
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(tmp_path / "ledger.jsonl"))
    monkeypatch.setenv("ROBOT_FLEET_AGENT_WALLET", "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25")
    get_settings.cache_clear()

    try:
        module.run(SimpleNamespace(
            tx_hash="0xnot-real",
            wallet_address="",
            metadata_uri="ipfs://omniagent",
            bridge_mode="manual-twak-cli",
        ))
    except ValueError as error:
        assert "valid BSC transaction hash" in str(error)
    else:
        raise AssertionError("invalid registration tx hash must fail")
    get_settings.cache_clear()
