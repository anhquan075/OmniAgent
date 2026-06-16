from datetime import datetime, timezone


class AgentWalletLogService:
    @staticmethod
    def build(wallet: dict[str, object], twak_status: dict[str, object]) -> dict[str, object]:
        read_at = datetime.now(timezone.utc).isoformat()
        configured_wallet = wallet.get("walletAddress")
        observed_wallet = twak_status.get("observedWallet") or None
        expected_wallet = twak_status.get("expectedWallet") or configured_wallet
        ready = bool(twak_status.get("ready"))
        reason = twak_status.get("reason") or wallet.get("twakReadinessReason")
        return {
            "recordType": "wallet",
            "executionKind": "agent_wallet_read",
            "eventType": "agent_wallet_read",
            "status": "ready" if ready else "guarded",
            "symbol": "BSC",
            "side": "agent wallet",
            "amountUsd": None,
            "txHash": None,
            "createdAt": read_at,
            "updatedAt": read_at,
            "walletAddress": observed_wallet,
            "configuredWallet": configured_wallet,
            "expectedWallet": expected_wallet,
            "observedWallet": observed_wallet,
            "bridgeMode": twak_status.get("mode") or AgentWalletLogService.twak_mode(wallet),
            "walletValidated": bool(twak_status.get("walletValidated")),
            "actionsValidated": bool(twak_status.get("actionsValidated")),
            "ready": ready,
            "reason": reason,
            "readSource": "bnb_get_wallet + bnb_trust_wallet_status",
            "readPaths": AgentWalletLogService.read_paths(twak_status),
        }

    @staticmethod
    def twak_mode(wallet: dict[str, object]) -> object:
        server = wallet.get("twakServer") if isinstance(wallet.get("twakServer"), dict) else {}
        return server.get("mode")

    @staticmethod
    def read_paths(twak_status: dict[str, object]) -> list[dict[str, object]]:
        probes = twak_status.get("probes")
        if not isinstance(probes, list):
            return []
        rows: list[dict[str, object]] = []
        for probe in probes[:4]:
            if not isinstance(probe, dict):
                continue
            rows.append({
                "path": str(probe.get("path") or ""),
                "ok": bool(probe.get("ok")),
                "statusCode": probe.get("statusCode"),
            })
        return rows
