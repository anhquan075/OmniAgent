from typing import Any

from app.services.casper.hashing import sha256_json, sha256_text
from app.services.casper.llm_trace import CasperLlmTraceService


class CasperGuardrailService:
    POLICY_TEMPLATES: dict[str, dict[str, Any]] = {
        "rwa-collateral-v1": {
            "label": "RWA collateral financing gate",
            "allowedActions": ["approve", "haircut", "block", "hold", "warn"],
            "warnRiskScore": 70,
            "blockRiskScore": 90,
        },
        "treasury-exposure-v1": {
            "label": "Treasury exposure risk gate",
            "allowedActions": ["approve", "haircut", "block", "hold", "warn"],
            "warnRiskScore": 65,
            "blockRiskScore": 88,
        },
        "defi-safety-v1": {
            "label": "DeFi safety execution gate",
            "allowedActions": ["approve", "warn", "block"],
            "warnRiskScore": 60,
            "blockRiskScore": 85,
        },
        "payout-eligibility-v1": {
            "label": "Autonomous payout eligibility gate",
            "allowedActions": ["approve", "hold", "block"],
            "warnRiskScore": 72,
            "blockRiskScore": 90,
        },
    }

    @staticmethod
    def evaluate(args: dict[str, Any]) -> dict[str, Any]:
        evidence = args.get("evidenceBundle") if isinstance(args.get("evidenceBundle"), dict) else {}
        policy_template = CasperGuardrailService.policy_template(args.get("policyTemplate"))
        proposed_action = str(args.get("proposedAction") or evidence.get("recommendedAction") or "hold")
        risk_score = int(evidence.get("riskScore") or 0)
        evidence_blockers = [str(item) for item in evidence.get("hardBlockers") or []]
        reason_codes = CasperGuardrailService.reason_codes(
            evidence_blockers,
            risk_score,
            proposed_action,
            policy_template,
        )
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
            "policyTemplate": policy_template,
            "roles": roles,
            "policyGate": policy_gate,
            "guardrailHash": sha256_json(roles),
        }

    @staticmethod
    def policy_template(value: object) -> dict[str, Any]:
        template_id = str(value or "rwa-collateral-v1")
        template = CasperGuardrailService.POLICY_TEMPLATES.get(template_id)
        if not template:
            template_id = "rwa-collateral-v1"
            template = CasperGuardrailService.POLICY_TEMPLATES[template_id]
        payload = {"id": template_id, **template}
        payload["templateHash"] = sha256_json(payload)
        return payload

    @staticmethod
    def reason_codes(
        blockers: list[str],
        risk_score: int,
        action: str,
        policy_template: dict[str, Any],
    ) -> list[str]:
        reasons = list(blockers)
        if action not in set(policy_template.get("allowedActions") or []):
            reasons.append("unsupported_policy_action")
        if risk_score >= 70 and action == "rebalance":
            reasons.append("high_risk_rebalance_blocked")
        if risk_score >= int(policy_template.get("blockRiskScore") or 90) and action not in {"block", "warn"}:
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
