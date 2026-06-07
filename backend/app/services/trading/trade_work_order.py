from typing import Any


BLOCKED_STATES = {"blocked", "failed", "paused"}
TERMINAL_STATES = {"receipt_confirmed", "settled", "failed", "paused"}


class TradeWorkOrderService:
    STATES = [
        ("intent_created", "Intent created"),
        ("signal_verified", "CMC signal verified"),
        ("risk_checked", "Risk checked"),
        ("route_built", "Router route built"),
        ("twak_submitted", "TWAK submitted"),
        ("receipt_confirmed", "Receipt confirmed"),
        ("settled", "Evidence settled"),
    ]
    STAGE_TO_STATE = {
        "sense": "signal_verified",
        "sense_price": "signal_verified",
        "sense_agent_hub": "signal_verified",
        "decide": "risk_checked",
        "quote": "route_built",
        "sign": "twak_submitted",
        "prove": "receipt_confirmed",
    }

    @classmethod
    def from_cycle(cls, payload: dict[str, Any]) -> dict[str, Any]:
        stages = payload.get("stages") if isinstance(payload.get("stages"), list) else []
        blockers = [
            str(stage.get("note") or stage.get("stage"))
            for stage in stages
            if isinstance(stage, dict) and str(stage.get("state") or "").lower() == "blocked"
        ]
        state = "blocked" if blockers else "intent_created"
        for stage in stages:
            if not isinstance(stage, dict):
                continue
            stage_state = str(stage.get("state") or "").lower()
            if stage_state in {"completed", "approved", "ready", "submitted", "verified"}:
                mapped = cls.STAGE_TO_STATE.get(str(stage.get("stage") or ""), state)
                if mapped == "twak_submitted" and stage_state != "submitted":
                    mapped = "route_built"
                state = mapped
        if payload.get("status") == "submitted":
            state = "twak_submitted"
        return cls._build(
            trade_intent_id=payload.get("tradeIntentId"),
            state=state,
            hard_blockers=blockers,
            evidence=payload,
        )

    @classmethod
    def from_proof_bundle(
        cls,
        preflight: dict[str, Any] | None,
        ledger: dict[str, Any],
        receipt: dict[str, Any] | None,
        submission: dict[str, Any] | None,
    ) -> dict[str, Any]:
        blockers = cls._preflight_blockers(preflight)
        receipt_proof = receipt.get("proof") if isinstance(receipt, dict) else {}
        if isinstance(receipt_proof, dict):
            blockers.extend(str(reason) for reason in receipt_proof.get("reasons") or [])
        if (ledger.get("control") or {}).get("emergencyPaused"):
            return cls._build(None, "paused", ["emergency_pause"], {})
        if isinstance(receipt, dict) and receipt.get("status") == "failed":
            return cls._build(submission and submission.get("tradeIntentId"), "failed", blockers, receipt)
        if isinstance(receipt_proof, dict) and receipt_proof.get("valid"):
            return cls._build(submission and submission.get("tradeIntentId"), "receipt_confirmed", [], receipt)
        if submission:
            state = "twak_submitted"
        elif cls._check_ok(preflight, "funded_route"):
            state = "route_built"
        elif blockers:
            state = "blocked"
        else:
            state = "intent_created"
        return cls._build(submission and submission.get("tradeIntentId"), state, blockers, submission or {})

    @staticmethod
    def terminal_state(payload: dict[str, Any]) -> bool:
        return str(payload.get("state") or "") in TERMINAL_STATES

    @classmethod
    def _build(
        cls,
        trade_intent_id: object,
        state: str,
        hard_blockers: list[str],
        evidence: dict[str, Any],
    ) -> dict[str, Any]:
        return {
            "id": str(trade_intent_id or "waiting-for-policy-intent"),
            "state": state,
            "terminal": state in TERMINAL_STATES,
            "hardBlockers": cls._dedupe(hard_blockers),
            "steps": cls._steps(state, hard_blockers, evidence),
        }

    @classmethod
    def _steps(cls, state: str, hard_blockers: list[str], evidence: dict[str, Any]) -> list[dict[str, str]]:
        active_index = next((index for index, item in enumerate(cls.STATES) if item[0] == state), 0)
        blocked = bool(hard_blockers) or state in BLOCKED_STATES
        steps: list[dict[str, str]] = []
        for index, (step_state, label) in enumerate(cls.STATES):
            status = "done" if index <= active_index and not blocked else "waiting"
            if blocked and index == min(active_index, len(cls.STATES) - 1):
                status = "blocked"
            steps.append({
                "id": step_state,
                "label": label,
                "status": status,
                "evidence": cls._evidence_text(step_state, evidence, hard_blockers),
            })
        return steps

    @staticmethod
    def _evidence_text(state: str, evidence: dict[str, Any], blockers: list[str]) -> str:
        if blockers:
            return blockers[0]
        if state == "twak_submitted":
            return str(evidence.get("txHash") or "waiting for tx hash")
        if state == "receipt_confirmed":
            return str(evidence.get("status") or "waiting for receipt")
        return state

    @staticmethod
    def _preflight_blockers(preflight: dict[str, Any] | None) -> list[str]:
        blockers = preflight.get("blockers") if isinstance(preflight, dict) else []
        return [
            str(item.get("name") or item.get("reason"))
            for item in blockers
            if isinstance(item, dict) and not item.get("ok", False)
        ]

    @staticmethod
    def _check_ok(preflight: dict[str, Any] | None, name: str) -> bool:
        checks = preflight.get("checks") if isinstance(preflight, dict) else []
        checks = checks if isinstance(checks, list) else []
        return any(isinstance(item, dict) and item.get("name") == name and item.get("ok") for item in checks)

    @staticmethod
    def _dedupe(items: list[str]) -> list[str]:
        seen: set[str] = set()
        result: list[str] = []
        for item in items:
            if item and item not in seen:
                seen.add(item)
                result.append(item)
        return result
