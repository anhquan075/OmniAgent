from collections import Counter
from typing import Any
from urllib.parse import urlsplit

from app.core.settings import get_settings
from app.services.casper.ledger import CasperDecisionLedger


INITIAL_DECISION_EVENT_TYPES = {
    "casper_decision_dry_run",
    "casper_decision_event",
    "casper_decision_live_submit_blocked",
    "casper_decision_live_submit_failed",
    "casper_decision_recorded",
    "casper_decision_submission_outcome_unknown",
    "casper_decision_submitted",
}
READBACK_EVENT_TYPES = {
    "casper_decision_readback_blocked",
    "casper_decision_readback_verified",
}
FAILURE_EVENT_TYPE = "casper_agent_cycle_failed"
DEFAULT_TOOLS = (
    "casper_rwa_evidence",
    "casper_guardrails",
    "casper_live_preflight",
    "casper_record_decision",
    "casper_record_readback",
)


class CasperCycleHistoryService:
    @staticmethod
    def get_cycle_history(limit: int = 8, offset: int = 0) -> dict[str, Any]:
        selected_limit = max(1, min(int(limit), 25))
        selected_offset = max(0, int(offset))
        ledger = CasperDecisionLedger.get_ledger_summary(
            limit=get_settings().casper_ledger_max_events
        )
        projected = CasperCycleHistoryService.project_events(ledger.get("events"))
        cycles = projected[selected_offset:selected_offset + selected_limit]
        total = len(projected)
        return {
            "network": "casper",
            "cycles": cycles,
            "count": len(cycles),
            "total": total,
            "limit": selected_limit,
            "offset": selected_offset,
            "hasNext": selected_offset + len(cycles) < total,
            "hasPrevious": selected_offset > 0,
        }

    @staticmethod
    def project_events(events: object) -> list[dict[str, Any]]:
        selected = [event for event in events or [] if isinstance(event, dict)] if isinstance(events, list) else []
        initial_events = CasperCycleHistoryService._deduplicate_cycle_events([
            event for event in selected
            if CasperCycleHistoryService._is_initial_cycle_event(event)
        ])
        readback_events = [
            event for event in selected
            if str(event.get("eventType") or "") in READBACK_EVENT_TYPES
        ]

        exact_readbacks: dict[str, dict[str, Any]] = {}
        legacy_readbacks: dict[str, dict[str, Any]] = {}
        for event in readback_events:
            cycle_id = CasperCycleHistoryService._explicit_cycle_id(event)
            if cycle_id:
                exact_readbacks.setdefault(cycle_id, event)
                continue
            deploy_hash = CasperCycleHistoryService._deploy_hash(event)
            if deploy_hash:
                legacy_readbacks.setdefault(deploy_hash, event)

        initial_hash_counts = Counter(
            deploy_hash
            for deploy_hash in (
                CasperCycleHistoryService._deploy_hash(event) for event in initial_events
            )
            if deploy_hash
        )
        cycles: list[dict[str, Any]] = []
        for event in initial_events:
            cycle_id = CasperCycleHistoryService._explicit_cycle_id(event)
            readback_event = exact_readbacks.pop(cycle_id or "", None)
            deploy_hash = CasperCycleHistoryService._deploy_hash(event)
            if readback_event is None and deploy_hash and initial_hash_counts[deploy_hash] == 1:
                readback_event = legacy_readbacks.pop(deploy_hash, None)
            cycles.append(CasperCycleHistoryService._project_cycle(event, readback_event))
        return cycles

    @staticmethod
    def _deduplicate_cycle_events(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Keep one durable outcome when a timed-out worker later completes."""
        deduplicated: list[dict[str, Any]] = []
        positions: dict[str, int] = {}
        for event in events:
            cycle_id = CasperCycleHistoryService._explicit_cycle_id(event)
            if not cycle_id:
                deduplicated.append(event)
                continue
            existing_position = positions.get(cycle_id)
            if existing_position is None:
                positions[cycle_id] = len(deduplicated)
                deduplicated.append(event)
                continue
            existing = deduplicated[existing_position]
            if (
                str(existing.get("eventType") or "") == FAILURE_EVENT_TYPE
                and str(event.get("eventType") or "") != FAILURE_EVENT_TYPE
            ):
                deduplicated[existing_position] = event
        return deduplicated

    @staticmethod
    def sanitize_preflight(value: object) -> dict[str, Any]:
        source = value if isinstance(value, dict) else {}
        account_balance = source.get("accountBalance")
        safe_balance: dict[str, Any] | None = None
        if isinstance(account_balance, dict):
            safe_balance = CasperCycleHistoryService._pick(
                account_balance,
                ("status", "source", "motes", "cspr", "minimumCspr"),
            )
        sanitized = CasperCycleHistoryService._pick(
            source,
            ("status", "rpcReachable", "liveSubmitEnabled"),
        )
        sanitized["hardBlockers"] = CasperCycleHistoryService._safe_strings(
            source.get("hardBlockers")
        )
        warnings = CasperCycleHistoryService._safe_strings(source.get("warnings"))
        if warnings:
            sanitized["warnings"] = warnings
        if safe_balance is not None:
            sanitized["accountBalance"] = safe_balance
        return sanitized

    @staticmethod
    def _is_initial_cycle_event(event: dict[str, Any]) -> bool:
        event_type = str(event.get("eventType") or "")
        if event_type == FAILURE_EVENT_TYPE:
            return True
        if event_type not in INITIAL_DECISION_EVENT_TYPES:
            return False
        return bool(CasperCycleHistoryService._decision(event))

    @staticmethod
    def _project_cycle(
        event: dict[str, Any],
        readback_event: dict[str, Any] | None,
    ) -> dict[str, Any]:
        payload = CasperCycleHistoryService._payload(event)
        readback_payload = CasperCycleHistoryService._payload(readback_event)
        event_type = str(event.get("eventType") or "")[:80]
        context = CasperCycleHistoryService._cycle_context(event)
        event_id = CasperCycleHistoryService._event_id(event)
        cycle_id = context.get("cycleId") or f"event-{event_id}"
        started_at = str(context.get("startedAt") or event.get("createdAt") or "")[:64]
        completed_at = str(
            (readback_event or {}).get("createdAt") or event.get("createdAt") or started_at
        )[:64]
        origin = str(context.get("origin") or "legacy")[:32]

        initial_decision = CasperCycleHistoryService._decision(event)
        readback_decision = CasperCycleHistoryService._decision(readback_event)
        decision = CasperCycleHistoryService._sanitize_decision({
            **initial_decision,
            **readback_decision,
        })
        initial_blockers = CasperCycleHistoryService._safe_strings(payload.get("hardBlockers"))
        readback_blockers = CasperCycleHistoryService._safe_strings(
            readback_payload.get("hardBlockers")
        )
        hard_blockers = list(dict.fromkeys(initial_blockers + readback_blockers))
        submitted = bool(payload.get("submitted"))
        status = CasperCycleHistoryService._cycle_status(
            event_type,
            payload,
            readback_payload if readback_event else None,
        )
        preflight = CasperCycleHistoryService.sanitize_preflight(payload.get("preflight"))
        deploy_status = CasperCycleHistoryService._deploy_status(
            decision,
            submitted,
            hard_blockers,
        )
        readback = CasperCycleHistoryService._readback_status(
            decision,
            readback_payload if readback_event else None,
            readback_blockers,
        )
        tools_used = CasperCycleHistoryService._tools_used(event, readback_event)
        tool_activity = CasperCycleHistoryService._tool_activity(
            cycle_id=cycle_id,
            event_type=event_type,
            decision=decision,
            preflight=preflight,
            deploy_status=deploy_status,
            readback=readback,
            tools_used=tools_used,
            hard_blockers=hard_blockers,
            readback_invoked=readback_event is not None,
        )
        lifecycle = CasperCycleHistoryService._lifecycle(decision, deploy_status, readback)
        bundle_status = (
            "live_verified" if status == "verified" else "blocked" if hard_blockers else status
        )
        cycle_context = {
            "cycleId": cycle_id,
            "origin": origin,
            "startedAt": started_at,
        }
        cycle = {
            "cycleContext": cycle_context,
            "toolsUsed": tools_used,
            "toolActivity": tool_activity,
        }
        return {
            "cycleId": cycle_id,
            "origin": origin,
            "startedAt": started_at,
            "completedAt": completed_at,
            "status": status,
            "eventType": event_type,
            "decisionId": decision.get("decisionId"),
            "submitted": submitted,
            "hardBlockers": hard_blockers,
            "runtime": {
                "network": "casper",
                "status": preflight.get("status") or status,
                "preflight": preflight,
                "cycle": cycle,
            },
            "bundle": {
                "network": "casper",
                "status": bundle_status,
                "preflight": preflight,
                "lifecycle": lifecycle,
                "latestDecision": decision or None,
                "deployStatus": deploy_status,
                "readback": readback,
                "proofScore": {
                    "hardBlocked": bool(hard_blockers),
                    "hardBlockers": hard_blockers,
                },
                "cycle": cycle,
            },
            "streamMeta": {
                "transport": "history",
                "event": "casper_agent_cycle",
                "sequence": event_id,
                "emittedAt": completed_at,
            },
        }

    @staticmethod
    def _cycle_status(
        event_type: str,
        payload: dict[str, Any],
        readback_payload: dict[str, Any] | None,
    ) -> str:
        if event_type == FAILURE_EVENT_TYPE:
            return "failed"
        if readback_payload is not None:
            return "verified" if readback_payload.get("readbackVerified") is True else "blocked"
        explicit = str(payload.get("submitStatus") or "")[:48]
        if explicit:
            return explicit
        if event_type == "casper_decision_dry_run":
            return "dry_run_blocked" if payload.get("hardBlockers") else "dry_run"
        return {
            "casper_decision_live_submit_blocked": "blocked",
            "casper_decision_live_submit_failed": "failed",
            "casper_decision_submission_outcome_unknown": "outcome_unknown",
            "casper_decision_submitted": "submitted",
        }.get(event_type, "recorded")

    @staticmethod
    def _tool_activity(
        *,
        cycle_id: str,
        event_type: str,
        decision: dict[str, Any],
        preflight: dict[str, Any],
        deploy_status: dict[str, Any],
        readback: dict[str, Any],
        tools_used: list[str],
        hard_blockers: list[str],
        readback_invoked: bool,
    ) -> list[dict[str, Any]]:
        evidence = decision.get("evidenceBundle") if isinstance(decision.get("evidenceBundle"), dict) else {}
        guardrails = decision.get("guardrails") if isinstance(decision.get("guardrails"), dict) else {}
        failed_before_runtime = event_type == FAILURE_EVENT_TYPE
        outputs: dict[str, dict[str, Any]] = {
            "casper_rwa_evidence": {
                "status": "failed" if failed_before_runtime else str(evidence.get("status") or "ready"),
                "riskScore": evidence.get("riskScore", decision.get("riskScore")),
                "sourceHash": evidence.get("sourceHash", decision.get("sourceHash")),
                "sources": len(evidence.get("sources") or []) if isinstance(evidence.get("sources"), list) else 0,
            },
            "casper_guardrails": {
                "status": str(guardrails.get("status") or decision.get("policyGate") or "skipped"),
                "guardrailHash": guardrails.get("guardrailHash", decision.get("guardrailHash")),
                "roles": len(guardrails.get("roles") or []) if isinstance(guardrails.get("roles"), list) else 0,
            },
            "casper_live_preflight": {**preflight},
            "casper_record_decision": {
                "decisionId": decision.get("decisionId"),
                "status": deploy_status.get("status"),
                "deployHash": deploy_status.get("deployHash") or decision.get("deployHash"),
                "proofDigest": decision.get("proofDigest"),
                "hardBlockers": hard_blockers,
            },
            "casper_record_readback": {**readback},
        }
        rows: list[dict[str, Any]] = []
        for index, tool in enumerate(DEFAULT_TOOLS, start=1):
            invoked = tool in tools_used
            if tool == "casper_record_readback":
                invoked = readback_invoked
            status = str(outputs[tool].get("status") or "complete")
            if not invoked:
                status = "skipped"
                outputs[tool] = {"status": "skipped"}
            rows.append({
                "callId": f"{cycle_id}:{index}",
                "tool": tool,
                "kind": "mcp_tool",
                "status": status,
                "invoked": invoked,
                "output": outputs[tool],
            })
        return rows

    @staticmethod
    def _tools_used(
        event: dict[str, Any],
        readback_event: dict[str, Any] | None,
    ) -> list[str]:
        tools: list[str] = []
        for selected in (event, readback_event):
            cycle = CasperCycleHistoryService._payload(selected).get("cycle")
            source = cycle.get("toolsUsed") if isinstance(cycle, dict) else None
            if isinstance(source, list):
                tools.extend(
                    str(tool)[:64]
                    for tool in source
                    if isinstance(tool, str) and tool in DEFAULT_TOOLS
                )
        if not tools:
            if str(event.get("eventType") or "") == FAILURE_EVENT_TYPE:
                return ["casper_rwa_evidence"]
            tools = list(DEFAULT_TOOLS[:-1])
        if readback_event is not None:
            tools.append("casper_record_readback")
        return list(dict.fromkeys(tools))

    @staticmethod
    def _sanitize_decision(value: object) -> dict[str, Any]:
        source = value if isinstance(value, dict) else {}
        decision = CasperCycleHistoryService._pick(
            source,
            (
                "decisionId",
                "receiptId",
                "action",
                "riskScore",
                "rationale",
                "rationaleHash",
                "sourceHash",
                "timestamp",
                "policyGate",
                "guardrailHash",
                "proofDigest",
                "deployHash",
                "transactionHash",
                "explorerUrl",
                "transactionExplorerUrl",
                "deployConfirmed",
            ),
        )
        materiality = source.get("materialityGate")
        if isinstance(materiality, dict):
            decision["materialityGate"] = CasperCycleHistoryService._pick(
                materiality, ("confidence", "threshold", "passed")
            )
        evidence = source.get("evidenceBundle")
        if isinstance(evidence, dict):
            safe_evidence = CasperCycleHistoryService._pick(
                evidence,
                ("scenario", "status", "riskScore", "sourceHash", "observedAt"),
            )
            sources: list[dict[str, Any]] = []
            for item in evidence.get("sources") or []:
                if isinstance(item, dict):
                    safe_source = CasperCycleHistoryService._pick(
                        item,
                        ("id", "label", "observedAt", "observedValue", "threshold", "unit"),
                    )
                    safe_url = CasperCycleHistoryService._safe_https_url(item.get("url"))
                    if safe_url:
                        safe_source["url"] = safe_url
                    sources.append(safe_source)
            safe_evidence["sources"] = sources[:12]
            decision["evidenceBundle"] = safe_evidence
        guardrails = source.get("guardrails")
        if isinstance(guardrails, dict):
            safe_guardrails = CasperCycleHistoryService._pick(
                guardrails, ("status", "guardrailHash")
            )
            roles: list[dict[str, Any]] = []
            for role in guardrails.get("roles") or []:
                if not isinstance(role, dict):
                    continue
                safe_role = CasperCycleHistoryService._pick(
                    role,
                    (
                        "agentRole",
                        "verdict",
                        "confidence",
                        "traceSource",
                        "outputHash",
                        "modelClaimHash",
                        "promptHash",
                    ),
                )
                safe_role["reasonCodes"] = CasperCycleHistoryService._safe_strings(
                    role.get("reasonCodes"), limit=8
                )
                roles.append(safe_role)
            safe_guardrails["roles"] = roles[:6]
            decision["guardrails"] = safe_guardrails
        deploy_status = source.get("deployStatus")
        if isinstance(deploy_status, dict):
            safe_deploy = CasperCycleHistoryService._pick(
                deploy_status,
                ("status", "source", "deployHash", "transactionHash"),
            )
            safe_deploy["hardBlockers"] = CasperCycleHistoryService._safe_strings(
                deploy_status.get("hardBlockers")
            )
            decision["deployStatus"] = safe_deploy
        readback = source.get("readback")
        if isinstance(readback, dict):
            decision["readback"] = CasperCycleHistoryService._pick(
                readback,
                (
                    "proofDigest",
                    "decisionReceipt",
                    "receiptVerified",
                    "source",
                    "transactionHash",
                    "stateRootHash",
                    "receiptStateRootHash",
                    "observedAt",
                ),
            )
        return decision

    @staticmethod
    def _deploy_status(
        decision: dict[str, Any],
        submitted: bool,
        hard_blockers: list[str],
    ) -> dict[str, Any]:
        stored = decision.get("deployStatus") if isinstance(decision.get("deployStatus"), dict) else {}
        deploy_hash = decision.get("deployHash") or decision.get("transactionHash")
        safe = CasperCycleHistoryService._pick(
            stored,
            ("status", "source", "deployHash", "transactionHash"),
        )
        safe.setdefault("deployHash", deploy_hash)
        safe.setdefault(
            "status",
            "pending_or_unverified" if submitted and deploy_hash else "not_submitted",
        )
        safe["hardBlockers"] = CasperCycleHistoryService._safe_strings(
            stored.get("hardBlockers")
        )
        if not safe["hardBlockers"] and not submitted:
            safe["hardBlockers"] = [
                blocker for blocker in hard_blockers if blocker.startswith("casper_")
            ]
        return safe

    @staticmethod
    def _readback_status(
        decision: dict[str, Any],
        payload: dict[str, Any] | None,
        blockers: list[str],
    ) -> dict[str, Any]:
        if payload is None:
            return {"verified": False, "status": "skipped", "hardBlockers": []}
        stored = decision.get("readback") if isinstance(decision.get("readback"), dict) else {}
        verified = payload.get("readbackVerified") is True
        safe = CasperCycleHistoryService._pick(
            stored,
            (
                "proofDigest",
                "decisionReceipt",
                "receiptVerified",
                "source",
                "transactionHash",
                "stateRootHash",
                "receiptStateRootHash",
                "observedAt",
            ),
        )
        safe.update({
            "verified": verified,
            "status": "verified" if verified else "blocked",
            "expectedProofDigest": decision.get("proofDigest"),
            "observedProofDigest": stored.get("proofDigest"),
            "hardBlockers": blockers,
        })
        return safe

    @staticmethod
    def _lifecycle(
        decision: dict[str, Any],
        deploy_status: dict[str, Any],
        readback: dict[str, Any],
    ) -> list[dict[str, str]]:
        guardrails = decision.get("guardrails") if isinstance(decision.get("guardrails"), dict) else {}
        return [
            {"state": "sense", "status": "complete" if decision else "failed"},
            {"state": "propose", "status": "complete" if decision else "waiting"},
            {"state": "critique", "status": "complete" if guardrails else "waiting"},
            {"state": "policy_gate", "status": str(decision.get("policyGate") or "blocked")},
            {"state": "submit", "status": str(deploy_status.get("status") or "not_submitted")},
            {"state": "readback", "status": str(readback.get("status") or "skipped")},
        ]

    @staticmethod
    def _explicit_cycle_id(event: dict[str, Any] | None) -> str:
        return str(CasperCycleHistoryService._cycle_context(event).get("cycleId") or "")[:96]

    @staticmethod
    def _cycle_context(event: dict[str, Any] | None) -> dict[str, Any]:
        cycle = CasperCycleHistoryService._payload(event).get("cycle")
        context = cycle.get("cycleContext") if isinstance(cycle, dict) else None
        if not isinstance(context, dict):
            return {}
        return CasperCycleHistoryService._pick(context, ("cycleId", "origin", "startedAt"))

    @staticmethod
    def _deploy_hash(event: dict[str, Any] | None) -> str:
        decision = CasperCycleHistoryService._decision(event)
        return str(decision.get("deployHash") or decision.get("transactionHash") or "")[:128]

    @staticmethod
    def _decision(event: dict[str, Any] | None) -> dict[str, Any]:
        decision = CasperCycleHistoryService._payload(event).get("decision")
        return decision if isinstance(decision, dict) else {}

    @staticmethod
    def _payload(event: dict[str, Any] | None) -> dict[str, Any]:
        payload = event.get("payload") if isinstance(event, dict) else None
        return payload if isinstance(payload, dict) else {}

    @staticmethod
    def _event_id(event: dict[str, Any]) -> int:
        try:
            return max(0, int(event.get("eventId") or 0))
        except (TypeError, ValueError):
            return 0

    @staticmethod
    def _pick(source: dict[str, Any], fields: tuple[str, ...]) -> dict[str, Any]:
        selected: dict[str, Any] = {}
        for field in fields:
            value = source.get(field)
            if isinstance(value, str):
                selected[field] = value[:CasperCycleHistoryService._string_limit(field)]
            elif value is None or isinstance(value, (bool, int, float)):
                if field in source:
                    selected[field] = value
        return selected

    @staticmethod
    def _string_limit(field: str) -> int:
        if field == "rationale":
            return 512
        if field in {"decisionId", "receiptId", "cycleId"}:
            return 96
        if field.endswith("Hash") or field in {"proofDigest", "sourceHash", "guardrailHash"}:
            return 160
        if field.endswith("At") or field == "timestamp":
            return 64
        return 256

    @staticmethod
    def _safe_https_url(value: object) -> str:
        if not isinstance(value, str) or not value:
            return ""
        selected = value[:512]
        try:
            parsed = urlsplit(selected)
            valid = bool(
                parsed.scheme == "https"
                and parsed.hostname
                and not parsed.username
                and not parsed.password
            )
        except ValueError:
            return ""
        if not valid:
            return ""
        return selected

    @staticmethod
    def _safe_strings(value: object, *, limit: int = 32) -> list[str]:
        if not isinstance(value, list):
            return []
        return [str(item)[:100] for item in value if isinstance(item, str)][:limit]
