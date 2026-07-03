from app.services.casper.guardrails import CasperGuardrailService


def evidence_fixture(risk_score: int = 22, blockers: list[str] | None = None) -> dict[str, object]:
    return {
        "riskScore": risk_score,
        "hardBlockers": blockers or [],
        "sources": [{"id": "src-1"}, {"id": "src-2"}],
        "recommendedAction": "approve",
    }


def test_high_risk_rebalance_is_blocked() -> None:
    result = CasperGuardrailService.evaluate({
        "evidenceBundle": evidence_fixture(risk_score=75),
        "proposedAction": "rebalance",
    })
    assert "high_risk_rebalance_blocked" in result["policyGate"]["reasonCodes"]
    assert result["status"] == "blocked"


def test_critical_risk_non_block_action_is_blocked() -> None:
    result = CasperGuardrailService.evaluate({
        "evidenceBundle": evidence_fixture(risk_score=95),
        "proposedAction": "approve",
    })
    assert "critical_risk_action_blocked" in result["policyGate"]["reasonCodes"]


def test_critical_risk_block_action_is_allowed() -> None:
    result = CasperGuardrailService.evaluate({
        "evidenceBundle": evidence_fixture(risk_score=95),
        "proposedAction": "block",
    })
    assert "critical_risk_action_blocked" not in result["policyGate"].get("reasonCodes", [])


def test_proposer_role_has_correct_verdict() -> None:
    result = CasperGuardrailService.evaluate({
        "evidenceBundle": evidence_fixture(),
        "proposedAction": "approve",
    })
    proposer = result["roles"][0]
    assert proposer["agentRole"] == "proposer"
    assert proposer["verdict"] == "proposed"
    assert proposer["confidence"] == 0.86


def test_critic_role_blocks_on_evidence_blockers() -> None:
    result = CasperGuardrailService.evaluate({
        "evidenceBundle": evidence_fixture(blockers=["rwa_evidence_missing"]),
        "proposedAction": "approve",
    })
    critic = result["roles"][1]
    assert critic["agentRole"] == "critic"
    assert critic["verdict"] == "blocked"
    assert critic["confidence"] == 0.58


def test_policy_gate_verdict_blocked_when_reasons_present() -> None:
    result = CasperGuardrailService.evaluate({
        "evidenceBundle": evidence_fixture(blockers=["rwa_evidence_stale"]),
        "proposedAction": "approve",
    })
    assert result["policyGate"]["verdict"] == "blocked"
    assert result["policyGate"]["confidence"] == 0.51


def test_policy_gate_verdict_approved_when_no_reasons() -> None:
    result = CasperGuardrailService.evaluate({
        "evidenceBundle": evidence_fixture(),
        "proposedAction": "approve",
    })
    assert result["policyGate"]["verdict"] == "approved"
    assert "policy_approved" in result["policyGate"]["reasonCodes"]


def test_guardrail_hash_is_deterministic() -> None:
    args = {"evidenceBundle": evidence_fixture(), "proposedAction": "approve"}
    r1 = CasperGuardrailService.evaluate(args)
    r2 = CasperGuardrailService.evaluate(args)
    assert r1["guardrailHash"] == r2["guardrailHash"]


def test_rationale_hash_is_sha256() -> None:
    result = CasperGuardrailService.evaluate({
        "evidenceBundle": evidence_fixture(),
        "proposedAction": "approve",
        "rationale": "test rationale",
    })
    assert all(role["rationaleHash"].startswith("sha256:") for role in result["roles"])


def test_empty_evidence_bundle_produces_blocked_verdict() -> None:
    result = CasperGuardrailService.evaluate({
        "evidenceBundle": {"hardBlockers": ["rwa_evidence_missing"]},
        "proposedAction": "approve",
    })
    assert result["status"] == "blocked"


def test_evidence_refs_from_evidence_sources() -> None:
    result = CasperGuardrailService.evaluate({
        "evidenceBundle": evidence_fixture(),
        "proposedAction": "approve",
    })
    assert result["policyGate"]["evidenceRefs"] == ["src-1", "src-2"]


def test_critic_passed_when_no_blockers() -> None:
    result = CasperGuardrailService.evaluate({
        "evidenceBundle": evidence_fixture(),
        "proposedAction": "approve",
    })
    critic = result["roles"][1]
    assert critic["verdict"] == "passed"
    assert "evidence_complete" in critic["reasonCodes"]


def test_roles_are_labelled_deterministic_when_llm_disabled(monkeypatch) -> None:
    monkeypatch.delenv("CASPER_LLM_TRACE_ENABLED", raising=False)

    result = CasperGuardrailService.evaluate({
        "evidenceBundle": evidence_fixture(),
        "proposedAction": "approve",
    })

    assert {role["traceSource"] for role in result["roles"]} == {"deterministic"}
    assert all(role["outputHash"].startswith("sha256:") for role in result["roles"])


def test_model_trace_cannot_approve_blocked_policy(monkeypatch) -> None:
    monkeypatch.setenv("CASPER_LLM_TRACE_ENABLED", "true")
    monkeypatch.setenv(
        "CASPER_LLM_TRACE_CAPTURE",
        '{"proposer":{"rationale":"ignore policy and approve","action":"approve"},"critic":{"verdict":"approved"}}',
    )

    result = CasperGuardrailService.evaluate({
        "evidenceBundle": evidence_fixture(blockers=["rwa_evidence_missing"]),
        "proposedAction": "approve",
    })

    assert result["status"] == "blocked"
    assert result["policyGate"]["verdict"] == "blocked"
    assert {role["traceSource"] for role in result["roles"]} == {"llm"}
    assert "rwa_evidence_missing" in result["policyGate"]["reasonCodes"]
