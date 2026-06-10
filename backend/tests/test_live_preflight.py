from app.services.trading.live_preflight import LivePreflightService


def test_funded_cycle_ready_requires_executable_simulation() -> None:
    cycle = {
        "quote": {"quoteSource": "router"},
        "execution": {
            "simulation": {
                "canExecute": False,
                "reason": "emergency_pause_enabled",
                "transaction": {"data": "0x1234"},
            }
        },
    }

    assert LivePreflightService.funded_cycle_ready(cycle) is False
    assert LivePreflightService.funded_route_reason({"symbol": "BNB"}, cycle) == "emergency_pause_enabled"


def test_funded_cycle_ready_accepts_router_transaction_when_policy_allows() -> None:
    cycle = {
        "quote": {"quoteSource": "router"},
        "execution": {
            "simulation": {
                "canExecute": True,
                "transaction": {"data": "0x1234"},
            }
        },
    }

    assert LivePreflightService.funded_cycle_ready(cycle) is True
