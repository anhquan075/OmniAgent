from typing import Any

from app.services.casper.hashing import sha256_json, sha256_text
from app.services.casper.llm_trace import CasperLlmTraceService


class CasperGuardrailService:
    @staticmethod
    def evaluate(args: dict[str, Any]) -> dict[str, Any]:
        evidence = args.get("evidenceBundle") if isinstance(args.get("evidenceBundle"), dict) else {}
        proposed_action = str(args.get("proposedAction") or evidence.get("recommendedAction") or "hold")
        risk_score = int(evidence.get("riskScore") or 0)
        evidence_blockers = [str(item) for item in evidence.get("hardBlockers") or []]
        reason_codes = CasperGuardrailService.reason_codes(evidence_blockers, risk_score, proposed_action)
        proposer = CasperGuardrailService.role_output(
            "proposer",
            "proposed",
            proposed_action,
            [f"risk_score_{risk_score}", f"action_{proposed_action}"],
            args.get("rationale") or "Proposed action from RWA/DeFi evidence.",
        )
        critic = CasperGuardrailService.role_output(
            "critic",
            "blocked" if reason_codes else "passed",
            proposed_action,
            reason_codes or ["evidence_complete"],
            "Critic checks source completeness, staleness, and unsafe action combinations.",
        )
        policy_gate = {
            "agentRole": "policy_gate",
            "verdict": "blocked" if reason_codes else "approved",
            "confidence": 0.94 if not reason_codes else 0.51,
            "reasonCodes": reason_codes or ["policy_approved"],
            "evidenceRefs": [source.get("id") for source in evidence.get("sources", []) if isinstance(source, dict)],
        }
        policy_gate["rationaleHash"] = sha256_text("|".join(policy_gate["reasonCodes"]))
        roles = [proposer, critic, policy_gate]
        CasperLlmTraceService.annotate_roles(roles, args)
        return {
            "network": "casper",
            "status": policy_gate["verdict"],
            "roles": roles,
            "policyGate": policy_gate,
            "guardrailHash": sha256_json(roles),
        }

    @staticmethod
    def reason_codes(blockers: list[str], risk_score: int, action: str) -> list[str]:
        reasons = list(blockers)
        if risk_score >= 70 and action == "rebalance":
            reasons.append("high_risk_rebalance_blocked")
        if risk_score >= 90 and action not in {"block", "warn"}:
            reasons.append("critical_risk_action_blocked")
        return list(dict.fromkeys(reasons))

    @staticmethod
    def role_output(
        agent_role: str,
        verdict: str,
        action: str,
        reason_codes: list[str],
        rationale: object,
    ) -> dict[str, Any]:
        return {
            "agentRole": agent_role,
            "verdict": verdict,
            "confidence": 0.86 if verdict in {"approved", "passed", "proposed"} else 0.58,
            "action": action,
            "reasonCodes": reason_codes,
            "evidenceRefs": [],
            "rationaleHash": sha256_text(str(rationale)),
        }
