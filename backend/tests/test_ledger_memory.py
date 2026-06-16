from app.services.agent.ledger_memory import LedgerMemoryService


def test_ledger_memory_prefers_cmc_signal_over_cascaded_route_blocker() -> None:
    reason = "CMC Agent Hub signal must include a sell trade signal for BNB."
    memory = LedgerMemoryService.build(
        {"events": []},
        {
            "readyForLiveTrade": False,
            "blockers": [
                {"name": "cmc_agent_hub_signal", "reason": reason},
                {"name": "funded_route", "reason": "router-backed transaction is required"},
            ],
        },
        {
            "proofScore": {
                "hardBlocked": True,
                "hardBlockers": ["cmc_agent_hub_signal", "funded_route"],
            }
        },
        {
            "strategyDecision": {
                "decision": {"action": "hold", "rationale": "Hold: cmc_agent_hub_signal_not_ready"}
            }
        },
    )

    assert memory["whyNoTrade"] == [reason]
    assert memory["latestDecision"]["reason"] == reason  # type: ignore[index]
