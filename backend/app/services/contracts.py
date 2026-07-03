from typing import Any, Protocol


class CasperLedgerService(Protocol):
    @staticmethod
    def append_event(event: dict[str, Any]) -> dict[str, Any]: ...

    @staticmethod
    def get_ledger_summary(limit: int = 20) -> dict[str, Any]: ...


class CasperRuntimeService(Protocol):
    @staticmethod
    def get_runtime_snapshot(args: dict[str, Any] | None = None) -> dict[str, Any]: ...

    @staticmethod
    def run_autonomous_cycle(args: dict[str, Any]) -> dict[str, Any]: ...


class ToolRegistryService(Protocol):
    @staticmethod
    def list_tools() -> list[dict[str, Any]]: ...

    @staticmethod
    async def call_tool(name: str, arguments: dict[str, Any]) -> dict[str, Any]: ...
