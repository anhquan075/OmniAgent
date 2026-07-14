from typing import Any


def resolve_policy_gate(
    args: dict[str, Any],
    evidence: dict[str, Any],
    guardrails: dict[str, Any],
) -> str:
    explicit = args.get("policyGate") or args.get("policy_gate")
    if explicit:
        return str(explicit)
    if isinstance(guardrails.get("policyGate"), dict):
        verdict = guardrails["policyGate"].get("verdict")
        if verdict:
            return "approved" if verdict == "approved" else "blocked"
    if guardrails.get("status") == "blocked" or evidence.get("status") == "blocked":
        return "blocked"
    return "approved"
