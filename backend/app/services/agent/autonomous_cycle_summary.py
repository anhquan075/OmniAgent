from typing import Any


class AutonomousCycleSummary:
    @staticmethod
    def from_result(result: dict[str, Any]) -> dict[str, Any]:
        return {
            "tradeIntentId": result.get("tradeIntentId"),
            "status": result.get("status"),
            "mode": result.get("mode"),
            "symbol": result.get("symbol"),
            "side": result.get("side"),
            "amountUsd": result.get("amountUsd"),
            "strategyDecision": result.get("strategyDecision"),
            "risk": result.get("risk"),
            "stages": result.get("stages") or [],
            "cmcAgentHubSignal": result.get("cmcAgentHubSignal"),
        }
