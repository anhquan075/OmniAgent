import httpx

from app.services.twak.config import TrustWalletBridgeConfig
from app.services.twak.config import TrustWalletConfigService
from app.services.twak.cli import TrustWalletCliClient
from app.services.twak.rest import TrustWalletRestClient
from app.services.wallet.agent_wallet import AgentWalletService

class TrustWalletBridge:
    @staticmethod
    async def get_trust_wallet_status() -> dict[str, object]:
        config = TrustWalletConfigService.get_trust_wallet_bridge_config()
        expected_wallet = str(AgentWalletService.get_wallet_data().get("walletAddress") or "")
        if not config.enabled:
            return TrustWalletBridge.unavailable_status(config.mode, "Trust Wallet Agent Kit is disabled")
        if config.mode == "cli":
            return TrustWalletBridge.validate_trust_wallet_cli(config, expected_wallet)
        if config.mode != "rest":
            return {
                **TrustWalletBridge.unavailable_status(config.mode, "TWAK REST bridge validation is required for live execution"),
                "enabled": True,
                "command": config.command,
            }
        if not config.base_url:
            return {**TrustWalletBridge.unavailable_status(config.mode, "TWAK REST bridge baseUrl is not configured"), "enabled": True}
        return await TrustWalletBridge.probe_trust_wallet_rest(config, expected_wallet)

    @staticmethod
    def unavailable_status(mode: str, reason: str) -> dict[str, object]:
        return {
            "network": "bsc",
            "mode": mode,
            "enabled": False,
            "reachable": False,
            "walletValidated": False,
            "ready": False,
            "reason": reason,
        }

    @staticmethod
    def validate_trust_wallet_cli(config: TrustWalletBridgeConfig, expected_wallet: str) -> dict[str, object]:
        status = TrustWalletCliClient.get_cli_wallet_status(config.command, config.timeout_ms / 1000)
        observed_wallet = TrustWalletCliClient.get_cli_wallet_address(config.command, "bsc", config.timeout_ms / 1000)
        reachable = "_error" not in status and bool(status)
        wallet_validated = bool(expected_wallet and observed_wallet and observed_wallet.lower() == expected_wallet.lower())
        reason = None
        if not reachable:
            reason = str(status.get("_error") or "TWAK CLI wallet status failed")
        elif expected_wallet and not observed_wallet:
            reason = "TWAK CLI did not expose a BSC wallet address"
        elif expected_wallet and observed_wallet and not wallet_validated:
            reason = "TWAK CLI wallet does not match the configured agent wallet"
        return {
            "network": "bsc",
            "mode": config.mode,
            "enabled": True,
            "reachable": reachable,
            "walletValidated": wallet_validated,
            "ready": reachable and wallet_validated,
            "expectedWallet": expected_wallet or None,
            "observedWallet": observed_wallet,
            "reason": reason,
            "status": status,
            "command": config.command,
        }

    @staticmethod
    async def probe_trust_wallet_rest(config: TrustWalletBridgeConfig, expected_wallet: str) -> dict[str, object]:
        probes = [await TrustWalletBridge.probe_rest_actions(config)]
        actions = TrustWalletBridge.rest_action_names(probes[0])
        best_payload: dict[str, object] = {}
        wallet_state: str | None = None
        for action, arguments in (("get_wallet_status", {}), ("get_address", {"chain": "bsc"})):
            probe = await TrustWalletBridge.probe_rest_action(config, action, arguments)
            probes.append(probe)
            payload = probe.get("payload")
            if isinstance(payload, dict):
                if isinstance(payload.get("state"), str):
                    wallet_state = payload["state"]
                if action == "get_address" or not best_payload:
                    best_payload = payload
        reachable = any(bool(probe.get("ok")) for probe in probes)
        observed_wallet = TrustWalletBridge.extract_wallet_address(best_payload)
        wallet_validated = bool(expected_wallet and observed_wallet and observed_wallet.lower() == expected_wallet.lower())
        actions_validated = "swap" in actions
        return {
            "network": "bsc",
            "mode": config.mode,
            "enabled": True,
            "baseUrl": config.base_url,
            "reachable": reachable,
            "walletValidated": wallet_validated,
            "actionsValidated": actions_validated,
            "ready": reachable and wallet_validated and actions_validated,
            "expectedWallet": expected_wallet or None,
            "observedWallet": observed_wallet,
            "actions": actions,
            "requiredActions": ["swap"],
            "reason": TrustWalletBridge.rest_reason(
                reachable,
                expected_wallet,
                observed_wallet,
                wallet_validated,
                actions_validated,
                wallet_state,
                probes,
                str(config.base_url),
            ),
            "probes": probes,
        }

    @staticmethod
    async def probe_rest_actions(config: TrustWalletBridgeConfig) -> dict[str, object]:
        try:
            payload = await TrustWalletRestClient.list_rest_actions(str(config.base_url), config.api_key, config.hmac_secret, config.timeout_ms / 1000)
        except httpx.HTTPStatusError as error:
            return {"path": "/actions", "ok": False, "statusCode": error.response.status_code, "error": str(error)}
        except httpx.HTTPError as error:
            return {"path": "/actions", "ok": False, "statusCode": None, "error": str(error)}
        return {"path": "/actions", "ok": isinstance(payload.get("actions"), list), "statusCode": 200, "payload": payload}

    @staticmethod
    async def probe_rest_action(config: TrustWalletBridgeConfig, action: str, arguments: dict[str, object]) -> dict[str, object]:
        try:
            payload = await TrustWalletRestClient.call_rest_action(
                str(config.base_url),
                config.api_key,
                config.hmac_secret,
                action,
                arguments,
                config.timeout_ms / 1000,
            )
        except httpx.HTTPStatusError as error:
            return {"path": f"/actions/{action}", "ok": False, "statusCode": error.response.status_code, "error": str(error)}
        except httpx.HTTPError as error:
            return {"path": f"/actions/{action}", "ok": False, "statusCode": None, "error": str(error)}
        return {"path": f"/actions/{action}", "ok": True, "statusCode": 200, "payload": payload}

    @staticmethod
    def rest_action_names(probe: dict[str, object]) -> list[str]:
        payload = probe.get("payload")
        actions = payload.get("actions") if isinstance(payload, dict) else None
        if not isinstance(actions, list):
            return []
        return sorted({str(action.get("name")) for action in actions if isinstance(action, dict) and action.get("name")})

    @staticmethod
    def extract_wallet_address(payload: dict[str, object]) -> str | None:
        candidates = [payload.get("walletAddress"), payload.get("address"), payload.get("agentWallet")]
        wallet = payload.get("wallet")
        if isinstance(wallet, dict):
            candidates.extend([wallet.get("walletAddress"), wallet.get("address"), wallet.get("agentWallet")])
        wallets = payload.get("wallets")
        if isinstance(wallets, list):
            for item in wallets:
                if isinstance(item, dict):
                    candidates.extend([item.get("walletAddress"), item.get("address"), item.get("agentWallet")])
                elif isinstance(item, str):
                    candidates.append(item)
        for candidate in candidates:
            if isinstance(candidate, str) and candidate.startswith("0x") and len(candidate) == 42:
                return candidate
        return None

    @staticmethod
    def rest_reason(
        reachable: bool,
        expected_wallet: str,
        observed_wallet: str | None,
        wallet_validated: bool,
        actions_validated: bool,
        wallet_state: str | None = None,
        probes: list[dict[str, object]] | None = None,
        base_url: str | None = None,
    ) -> str | None:
        status_codes = [probe.get("statusCode") for probe in probes or [] if isinstance(probe.get("statusCode"), int)]
        if any(status_code in {401, 403} for status_code in status_codes):
            return "TWAK REST bridge rejected backend auth; set matching TW_HMAC_SECRET on backend and TWAK_HMAC_SECRET on bridge."
        if not reachable:
            status_code = status_codes[0] if status_codes else None
            if status_code == 404:
                return f"TWAK REST bridge returned 404 for {base_url}; check TRUST_WALLET_AGENT_KIT_CONFIG baseUrl."
            return "TWAK REST bridge is not reachable"
        if expected_wallet and not observed_wallet and wallet_state == "unbound":
            return "TWAK REST bridge wallet is unbound; bind the local TWAK wallet or connect WalletConnect."
        if expected_wallet and not observed_wallet:
            return "TWAK REST bridge did not expose a wallet address"
        if expected_wallet and observed_wallet and not wallet_validated:
            return "TWAK REST wallet does not match the configured agent wallet"
        if not actions_validated:
            return "TWAK REST bridge does not expose required swap action"
        return None
