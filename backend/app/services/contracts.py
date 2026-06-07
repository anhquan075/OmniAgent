from typing import Any, Protocol


class LedgerService(Protocol):
    @staticmethod
    def append_event(event: dict[str, Any]) -> dict[str, Any]: ...

    @staticmethod
    def get_ledger_summary(limit: int = 20) -> dict[str, Any]: ...


class PriceService(Protocol):
    @staticmethod
    async def get_price_snapshot(symbols: list[str]) -> dict[str, Any]: ...


class ToolRegistryService(Protocol):
    @staticmethod
    def list_tools() -> list[dict[str, Any]]: ...

    @staticmethod
    async def call_tool(name: str, arguments: dict[str, Any]) -> dict[str, Any]: ...


class WalletBridgeService(Protocol):
    @staticmethod
    async def get_trust_wallet_status() -> dict[str, Any]: ...


class TradingAgentService(Protocol):
    @staticmethod
    async def run_autonomous_cycle(args: dict[str, Any]) -> dict[str, Any]: ...
