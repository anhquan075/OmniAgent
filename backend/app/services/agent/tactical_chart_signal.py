from typing import Any

from app.services.agent.heikin_ashi_signal import HeikinAshiSignalService


class TacticalChartSignalService:
    @staticmethod
    def from_market_context(
        snapshot: dict[str, Any],
        cmc_agent_hub_signal: dict[str, Any] | None,
        symbol: str,
    ) -> dict[str, Any]:
        chart = TacticalChartSignalService.extract_chart(cmc_agent_hub_signal)
        source = "cmc_agent_hub_signal"
        if not chart:
            market = TacticalChartSignalService.market_row(snapshot, symbol)
            chart = market.get("chart") if isinstance(market, dict) and isinstance(market.get("chart"), list) else None
            source = "cmc_snapshot"
        if not chart:
            return {"ready": False, "type": "neutral", "label": "WAIT", "reason": "chart_signal_unavailable"}
        return HeikinAshiSignalService.evaluate(chart, period="5m", source=source)

    @staticmethod
    def extract_chart(signal: dict[str, Any] | None) -> list[dict[str, Any]] | None:
        if not isinstance(signal, dict):
            return None
        for candidate in (signal.get("parsedContent"), signal.get("result"), signal):
            chart = TacticalChartSignalService.find_chart(candidate)
            if chart:
                return chart
        return None

    @staticmethod
    def find_chart(value: Any) -> list[dict[str, Any]] | None:
        if isinstance(value, dict):
            if isinstance(value.get("chart"), list):
                return [item for item in value["chart"] if isinstance(item, dict)]
            for nested in value.values():
                chart = TacticalChartSignalService.find_chart(nested)
                if chart:
                    return chart
        if isinstance(value, list):
            if value and all(isinstance(item, dict) and ("price" in item or "close" in item) for item in value):
                return [item for item in value if isinstance(item, dict)]
            for nested in value:
                chart = TacticalChartSignalService.find_chart(nested)
                if chart:
                    return chart
        return None

    @staticmethod
    def market_row(snapshot: dict[str, Any], symbol: str) -> dict[str, Any] | None:
        symbols = snapshot.get("symbols") if isinstance(snapshot.get("symbols"), dict) else {}
        item = symbols.get(symbol.upper()) if isinstance(symbols, dict) else None
        return item if isinstance(item, dict) else None
