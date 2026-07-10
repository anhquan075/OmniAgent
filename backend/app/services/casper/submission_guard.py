from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import sqlite3
from typing import Any

from app.core.settings import get_settings
from app.services.casper.hashing import sha256_json


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class CasperSubmissionGuard:
    """Persistent, process-safe admission control for Casper live submissions."""

    STATUSES = {
        "reserved",
        "submitted",
        "confirmed",
        "outcome_unknown",
        "failed",
    }
    DUPLICATE_BLOCKER = "casper_submission_duplicate_intent"
    OUTSTANDING_BLOCKER = "casper_submission_outstanding"
    COOLDOWN_BLOCKER = "casper_submission_cooldown_active"
    DAILY_COUNT_BLOCKER = "casper_submission_daily_count_exceeded"
    DAILY_BUDGET_BLOCKER = "casper_submission_daily_budget_exceeded"
    CHAIN_DUPLICATE_BLOCKER = "casper_chain_duplicate_intent"
    CHAIN_ID_COLLISION_BLOCKER = "casper_chain_semantic_id_collision"
    CHAIN_COOLDOWN_BLOCKER = "casper_chain_submission_cooldown_active"
    CHAIN_STATE_BLOCKER = "casper_chain_submission_guard_unavailable"
    VOLATILE_INTENT_KEYS = {
        "decisionId",
        "decision_id",
        "timestamp",
        "proofDigest",
        "proof_digest",
    }

    @classmethod
    def check_chain_state(cls, decision: dict[str, Any]) -> dict[str, Any]:
        """Fail-closed replay/cooldown check using the contract's durable receipt."""
        settings = get_settings()
        if not settings.casper_live_require_chain_dedupe:
            return {
                "allowed": True,
                "status": "skipped",
                "hardBlockers": [],
                "metadata": {"required": False},
            }

        # Imported lazily to keep the low-level submitter independent from the
        # policy layer that calls it.
        from app.services.casper.receipt import CasperDecisionReceiptService
        from app.services.casper.submitter import CasperCliSubmitter
        from app.services.casper.client import CasperJsonRpcClient

        semantic_id = cls.semantic_decision_id(decision)
        if str(decision.get("decisionId") or "") == semantic_id:
            candidate = CasperJsonRpcClient.probe_decision_receipt_sync(semantic_id)
            if candidate.get("status") == "blocked":
                return cls._chain_blocked(candidate, semantic_id)
            if candidate.get("status") == "found":
                candidate_value = str(candidate.get("decisionReceipt") or "")
                if len(candidate_value.encode("utf-8")) > settings.casper_live_max_receipt_bytes:
                    return cls._chain_blocked(candidate, semantic_id)
                existing = CasperDecisionReceiptService.parse_receipt_value(candidate_value)
                if not existing:
                    return cls._chain_blocked(candidate, semantic_id)
                blocker = (
                    cls.CHAIN_DUPLICATE_BLOCKER
                    if cls._same_receipt_intent(existing, decision)
                    else cls.CHAIN_ID_COLLISION_BLOCKER
                )
                return {
                    "allowed": False,
                    "status": "blocked",
                    "hardBlockers": [blocker],
                    "metadata": {
                        "required": True,
                        "semanticDecisionId": semantic_id,
                        "latestDecisionId": None,
                    },
                }

        latest_id = CasperCliSubmitter.query_latest_decision_id()
        if latest_id.get("hardBlockers"):
            return cls._chain_blocked(latest_id)
        decision_id = str(latest_id.get("decisionId") or "").strip()
        if not decision_id:
            return {
                "allowed": True,
                "status": "ready",
                "hardBlockers": [],
                "metadata": {"required": True, "latestDecisionId": None},
            }

        receipt_result = CasperCliSubmitter.query_decision_receipt(decision_id)
        if receipt_result.get("hardBlockers"):
            return cls._chain_blocked(receipt_result, decision_id)
        receipt_value = str(receipt_result.get("decisionReceipt") or "")
        if len(receipt_value.encode("utf-8")) > settings.casper_live_max_receipt_bytes:
            return cls._chain_blocked(receipt_result, decision_id)
        receipt = CasperDecisionReceiptService.parse_receipt_value(receipt_value)
        if not receipt:
            return cls._chain_blocked(receipt_result, decision_id)

        same_intent = cls._same_receipt_intent(receipt, decision)
        blockers = [cls.CHAIN_DUPLICATE_BLOCKER] if same_intent else []
        cooldown_remaining = 0
        try:
            previous_at = datetime.fromisoformat(str(receipt["timestamp"]).replace("Z", "+00:00"))
            if previous_at.tzinfo is None:
                previous_at = previous_at.replace(tzinfo=timezone.utc)
            elapsed = max(0.0, (_utc_now() - previous_at.astimezone(timezone.utc)).total_seconds())
            cooldown_remaining = max(
                0,
                int(settings.casper_live_min_submit_interval_sec - elapsed + 0.999999),
            )
        except (KeyError, TypeError, ValueError):
            return cls._chain_blocked(receipt_result, decision_id)
        if cooldown_remaining > 0 and not same_intent:
            blockers.append(cls.CHAIN_COOLDOWN_BLOCKER)
        return {
            "allowed": not blockers,
            "status": "blocked" if blockers else "ready",
            "hardBlockers": blockers,
            "metadata": {
                "required": True,
                "semanticDecisionId": semantic_id,
                "latestDecisionId": decision_id,
                "latestSourceHash": receipt.get("sourceHash"),
                "latestTimestamp": receipt.get("timestamp"),
                "cooldownRemainingSec": cooldown_remaining,
            },
        }

    @classmethod
    def semantic_decision_id(cls, decision: dict[str, Any]) -> str:
        key = cls.idempotency_key(decision).removeprefix("sha256:")
        return f"rwa-collateral-{key[:20]}"

    @staticmethod
    def _same_receipt_intent(receipt: dict[str, Any], decision: dict[str, Any]) -> bool:
        return all(
            (
                str(receipt.get("sourceHash") or "") == str(decision.get("sourceHash") or ""),
                str(receipt.get("action") or "") == str(decision.get("action") or ""),
                int(receipt.get("riskScore") or 0) == int(decision.get("riskScore") or 0),
                str(receipt.get("policyGate") or "") == str(decision.get("policyGate") or ""),
            )
        )

    @classmethod
    def _chain_blocked(
        cls,
        result: dict[str, Any],
        decision_id: str | None = None,
    ) -> dict[str, Any]:
        return {
            "allowed": False,
            "status": "blocked",
            "hardBlockers": [cls.CHAIN_STATE_BLOCKER],
            "metadata": {
                "required": True,
                "latestDecisionId": decision_id,
                "upstreamBlockers": list(result.get("hardBlockers") or []),
            },
        }

    @classmethod
    def reserve(cls, decision: dict[str, Any]) -> dict[str, Any]:
        """Atomically reserve capacity for one economically distinct decision."""
        settings = get_settings()
        now = _utc_now()
        now_iso = cls._iso(now)
        day_start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
        day_end = day_start + timedelta(days=1)
        intent = cls.economic_intent(decision)
        key = sha256_json(intent)
        payment_motes = max(0, int(settings.casper_payment_amount_motes))
        cooldown_sec = max(
            0,
            int(getattr(settings, "casper_live_min_submit_interval_sec", 0)),
        )
        daily_limit = max(
            0,
            int(getattr(settings, "casper_live_max_submissions_per_utc_day", 24)),
        )
        daily_budget_motes = max(
            0,
            int(getattr(settings, "casper_live_daily_budget_motes", 60_000_000_000)),
        )

        db = cls._connect()
        try:
            db.execute("BEGIN IMMEDIATE")
            cls._ensure_schema(db)

            existing = db.execute(
                """
                SELECT * FROM casper_submission_guard
                WHERE idempotency_key = ?
                """,
                (key,),
            ).fetchone()
            outstanding = db.execute(
                """
                SELECT * FROM casper_submission_guard
                WHERE status IN ('reserved', 'submitted', 'outcome_unknown')
                ORDER BY reserved_at ASC, id ASC
                LIMIT 1
                """
            ).fetchone()
            daily_row = db.execute(
                """
                SELECT COUNT(*) AS submission_count,
                       COALESCE(SUM(payment_amount_motes), 0) AS budget_used_motes
                FROM casper_submission_guard
                WHERE reserved_at >= ? AND reserved_at < ?
                """,
                (cls._iso(day_start), cls._iso(day_end)),
            ).fetchone()
            latest = db.execute(
                """
                SELECT reserved_at FROM casper_submission_guard
                ORDER BY reserved_at DESC, id DESC
                LIMIT 1
                """
            ).fetchone()

            daily_count = int(daily_row["submission_count"] or 0)
            budget_used_motes = int(daily_row["budget_used_motes"] or 0)
            cooldown_remaining_sec = cls._cooldown_remaining(latest, now, cooldown_sec)
            blockers: list[str] = []

            if existing is not None:
                blockers.append(cls.DUPLICATE_BLOCKER)
            elif outstanding is not None:
                blockers.append(cls.OUTSTANDING_BLOCKER)
            else:
                if cooldown_remaining_sec > 0:
                    blockers.append(cls.COOLDOWN_BLOCKER)
                if daily_count >= daily_limit:
                    blockers.append(cls.DAILY_COUNT_BLOCKER)
                if budget_used_motes + payment_motes > daily_budget_motes:
                    blockers.append(cls.DAILY_BUDGET_BLOCKER)

            if blockers:
                metadata = cls._reservation_metadata(
                    key=key,
                    intent=intent,
                    payment_motes=payment_motes,
                    daily_count=daily_count,
                    budget_used_motes=budget_used_motes,
                    cooldown_sec=cooldown_sec,
                    cooldown_remaining_sec=cooldown_remaining_sec,
                    daily_limit=daily_limit,
                    daily_budget_motes=daily_budget_motes,
                    existing=existing,
                    outstanding=outstanding,
                    day_start=day_start,
                    reserved=False,
                )
                db.commit()
                return {
                    "allowed": False,
                    "reserved": False,
                    "status": "blocked",
                    "idempotencyKey": key,
                    "hardBlockers": blockers,
                    "metadata": metadata,
                }

            db.execute(
                """
                INSERT INTO casper_submission_guard (
                    idempotency_key,
                    intent_json,
                    decision_id,
                    status,
                    deploy_hash,
                    payment_amount_motes,
                    reserved_at,
                    submitted_at,
                    confirmed_at,
                    updated_at,
                    last_error
                ) VALUES (?, ?, ?, 'reserved', NULL, ?, ?, NULL, NULL, ?, NULL)
                """,
                (
                    key,
                    json.dumps(intent, sort_keys=True, separators=(",", ":")),
                    cls._decision_id(decision),
                    payment_motes,
                    now_iso,
                    now_iso,
                ),
            )
            db.commit()
            metadata = cls._reservation_metadata(
                key=key,
                intent=intent,
                payment_motes=payment_motes,
                daily_count=daily_count + 1,
                budget_used_motes=budget_used_motes + payment_motes,
                cooldown_sec=cooldown_sec,
                cooldown_remaining_sec=cooldown_sec,
                daily_limit=daily_limit,
                daily_budget_motes=daily_budget_motes,
                existing=None,
                outstanding=None,
                day_start=day_start,
                reserved=True,
            )
            return {
                "allowed": True,
                "reserved": True,
                "status": "reserved",
                "idempotencyKey": key,
                "hardBlockers": [],
                "metadata": metadata,
            }
        except Exception:
            if db.in_transaction:
                db.rollback()
            raise
        finally:
            db.close()

    @classmethod
    def mark_submitted(cls, key: str, deploy_hash: str) -> dict[str, Any]:
        selected_hash = str(deploy_hash or "").strip()
        if not selected_hash:
            return cls._transition_error(
                key,
                "casper_submission_deploy_hash_missing",
            )
        return cls._transition(
            key,
            target="submitted",
            allowed_from={"reserved", "outcome_unknown", "submitted"},
            assignments={
                "deploy_hash": selected_hash,
                "submitted_at": _utc_now,
            },
        )

    @classmethod
    def mark_confirmed(cls, key: str) -> dict[str, Any]:
        return cls._transition(
            key,
            target="confirmed",
            allowed_from={"submitted", "outcome_unknown", "confirmed"},
            assignments={"confirmed_at": _utc_now},
        )

    @classmethod
    def mark_outcome_unknown(
        cls,
        key: str,
        error: str | None = None,
    ) -> dict[str, Any]:
        return cls._transition(
            key,
            target="outcome_unknown",
            allowed_from={"reserved", "submitted", "outcome_unknown"},
            assignments={"last_error": str(error or "") or None},
        )

    @classmethod
    def mark_failed(cls, key: str, error: str | None = None) -> dict[str, Any]:
        return cls._transition(
            key,
            target="failed",
            allowed_from={"reserved", "submitted", "outcome_unknown", "failed"},
            assignments={"last_error": str(error or "") or None},
        )

    @classmethod
    def reset_for_tests(cls) -> None:
        """Clear guard records without touching the decision event ledger."""
        db = cls._connect()
        try:
            db.execute("BEGIN IMMEDIATE")
            cls._ensure_schema(db)
            db.execute("DELETE FROM casper_submission_guard")
            db.commit()
        except Exception:
            if db.in_transaction:
                db.rollback()
            raise
        finally:
            db.close()

    @classmethod
    def economic_intent(cls, decision: dict[str, Any]) -> dict[str, Any]:
        """Return only fields that can change the decision's economic meaning."""
        evidence = cls._mapping(
            cls._first(decision, "evidenceBundle", "evidence_bundle")
        )
        guardrails = cls._mapping(decision.get("guardrails"))
        source_hash = cls._first(decision, "sourceHash", "source_hash")
        if source_hash is None:
            source_hash = cls._first(evidence, "sourceHash", "source_hash")

        risk_score = cls._first(decision, "riskScore", "risk_score")
        if risk_score is None:
            risk_score = cls._first(evidence, "riskScore", "risk_score")

        policy_gate: Any = cls._first(decision, "policyGate", "policy_gate")
        nested_policy_gate = guardrails.get("policyGate")
        if policy_gate is None and isinstance(nested_policy_gate, dict):
            policy_gate = nested_policy_gate.get("verdict")
        if policy_gate is None:
            policy_gate = guardrails.get("status")

        policy_template = cls._first(decision, "policyTemplate", "policy_template")
        if policy_template is None:
            policy_template = cls._first(guardrails, "policyTemplate", "policy_template")

        return {
            "sourceHash": cls._normalized_string(source_hash),
            "action": cls._normalized_string(
                cls._first(decision, "action", "proposedAction", "proposed_action")
            ).lower(),
            "riskScore": cls._normalized_number(risk_score),
            "policyGate": cls._policy_gate_value(policy_gate),
            "policyTemplate": cls._normalize_json(policy_template),
            "guardrailOutcome": cls._guardrail_outcome(decision, guardrails),
        }

    @classmethod
    def idempotency_key(cls, decision: dict[str, Any]) -> str:
        return sha256_json(cls.economic_intent(decision))

    @classmethod
    def _transition(
        cls,
        key: str,
        *,
        target: str,
        allowed_from: set[str],
        assignments: dict[str, Any],
    ) -> dict[str, Any]:
        if target not in cls.STATUSES:
            raise ValueError(f"Unsupported Casper submission status: {target}")
        selected_key = str(key or "").strip()
        if not selected_key:
            return cls._transition_error(
                selected_key,
                "casper_submission_idempotency_key_missing",
            )

        now = _utc_now()
        db = cls._connect()
        try:
            db.execute("BEGIN IMMEDIATE")
            cls._ensure_schema(db)
            row = db.execute(
                "SELECT * FROM casper_submission_guard WHERE idempotency_key = ?",
                (selected_key,),
            ).fetchone()
            if row is None:
                db.commit()
                return cls._transition_error(
                    selected_key,
                    "casper_submission_reservation_missing",
                )
            if str(row["status"]) not in allowed_from:
                db.commit()
                return {
                    "updated": False,
                    "status": str(row["status"]),
                    "idempotencyKey": selected_key,
                    "hardBlockers": ["casper_submission_invalid_status_transition"],
                    "metadata": cls._record_metadata(row),
                }

            values: dict[str, Any] = {
                "status": target,
                "updated_at": cls._iso(now),
            }
            for column, value in assignments.items():
                resolved = value() if callable(value) else value
                if isinstance(resolved, datetime):
                    resolved = cls._iso(resolved)
                values[column] = resolved
            set_clause = ", ".join(f"{column} = ?" for column in values)
            db.execute(
                f"UPDATE casper_submission_guard SET {set_clause} WHERE idempotency_key = ?",
                (*values.values(), selected_key),
            )
            updated = db.execute(
                "SELECT * FROM casper_submission_guard WHERE idempotency_key = ?",
                (selected_key,),
            ).fetchone()
            db.commit()
            return {
                "updated": True,
                "status": target,
                "idempotencyKey": selected_key,
                "hardBlockers": [],
                "metadata": cls._record_metadata(updated),
            }
        except Exception:
            if db.in_transaction:
                db.rollback()
            raise
        finally:
            db.close()

    @staticmethod
    def _transition_error(key: str, blocker: str) -> dict[str, Any]:
        return {
            "updated": False,
            "status": "blocked",
            "idempotencyKey": key or None,
            "hardBlockers": [blocker],
            "metadata": {},
        }

    @classmethod
    def _reservation_metadata(
        cls,
        *,
        key: str,
        intent: dict[str, Any],
        payment_motes: int,
        daily_count: int,
        budget_used_motes: int,
        cooldown_sec: int,
        cooldown_remaining_sec: int,
        daily_limit: int,
        daily_budget_motes: int,
        existing: sqlite3.Row | None,
        outstanding: sqlite3.Row | None,
        day_start: datetime,
        reserved: bool,
    ) -> dict[str, Any]:
        return {
            "idempotencyKey": key,
            "economicIntent": intent,
            "paymentAmountMotes": payment_motes,
            "minSubmitIntervalSec": cooldown_sec,
            "cooldownRemainingSec": cooldown_remaining_sec,
            "maxSubmissionsPerUtcDay": daily_limit,
            "dailySubmissionCount": daily_count,
            "dailyBudgetMotes": daily_budget_motes,
            "dailyBudgetUsedMotes": budget_used_motes,
            "dailyBudgetRemainingMotes": max(0, daily_budget_motes - budget_used_motes),
            "utcDay": day_start.date().isoformat(),
            "existingStatus": str(existing["status"]) if existing is not None else None,
            "outstandingIdempotencyKey": (
                str(outstanding["idempotency_key"])
                if outstanding is not None
                else (key if reserved else None)
            ),
            "outstandingStatus": (
                str(outstanding["status"])
                if outstanding is not None
                else ("reserved" if reserved else None)
            ),
        }

    @staticmethod
    def _record_metadata(row: sqlite3.Row | None) -> dict[str, Any]:
        if row is None:
            return {}
        return {
            "idempotencyKey": str(row["idempotency_key"]),
            "decisionId": row["decision_id"],
            "status": str(row["status"]),
            "deployHash": row["deploy_hash"],
            "paymentAmountMotes": int(row["payment_amount_motes"]),
            "reservedAt": str(row["reserved_at"]),
            "submittedAt": row["submitted_at"],
            "confirmedAt": row["confirmed_at"],
            "updatedAt": str(row["updated_at"]),
            "lastError": row["last_error"],
        }

    @classmethod
    def _guardrail_outcome(
        cls,
        decision: dict[str, Any],
        guardrails: dict[str, Any],
    ) -> Any:
        explicit = cls._first(decision, "guardrailOutcome", "guardrail_outcome")
        if explicit is not None:
            return cls._normalize_json(explicit)

        gate = guardrails.get("policyGate")
        gate = gate if isinstance(gate, dict) else {}
        reasons = gate.get("reasonCodes")
        if isinstance(reasons, list):
            normalized_reasons = sorted(
                {cls._normalized_string(item) for item in reasons}
            )
        else:
            normalized_reasons = []
        outcome = {
            "status": cls._normalized_string(guardrails.get("status")).lower(),
            "verdict": cls._normalized_string(gate.get("verdict")).lower(),
            "reasonCodes": normalized_reasons,
        }
        if any((outcome["status"], outcome["verdict"], outcome["reasonCodes"])):
            return outcome
        return cls._normalized_string(
            cls._first(decision, "guardrailHash", "guardrail_hash")
        )

    @classmethod
    def _cooldown_remaining(
        cls,
        latest: sqlite3.Row | None,
        now: datetime,
        cooldown_sec: int,
    ) -> int:
        if latest is None or cooldown_sec <= 0:
            return 0
        try:
            latest_at = datetime.fromisoformat(str(latest["reserved_at"]))
            if latest_at.tzinfo is None:
                latest_at = latest_at.replace(tzinfo=timezone.utc)
        except (TypeError, ValueError):
            return cooldown_sec
        elapsed = max(0.0, (now - latest_at.astimezone(timezone.utc)).total_seconds())
        return max(0, int((cooldown_sec - elapsed) + 0.999999))

    @classmethod
    def _connect(cls) -> sqlite3.Connection:
        path = Path(get_settings().casper_decision_ledger_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        db = sqlite3.connect(path, timeout=30.0, isolation_level=None)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA busy_timeout = 30000")
        db.execute("PRAGMA journal_mode = WAL")
        return db

    @staticmethod
    def _ensure_schema(db: sqlite3.Connection) -> None:
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS casper_submission_guard (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                idempotency_key TEXT NOT NULL UNIQUE,
                intent_json TEXT NOT NULL,
                decision_id TEXT,
                status TEXT NOT NULL CHECK (
                    status IN (
                        'reserved',
                        'submitted',
                        'confirmed',
                        'outcome_unknown',
                        'failed'
                    )
                ),
                deploy_hash TEXT,
                payment_amount_motes INTEGER NOT NULL CHECK (payment_amount_motes >= 0),
                reserved_at TEXT NOT NULL,
                submitted_at TEXT,
                confirmed_at TEXT,
                updated_at TEXT NOT NULL,
                last_error TEXT
            )
            """
        )
        db.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_casper_submission_guard_status
            ON casper_submission_guard (status)
            """
        )
        db.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_casper_submission_guard_reserved_at
            ON casper_submission_guard (reserved_at)
            """
        )

    @staticmethod
    def _iso(value: datetime) -> str:
        return value.astimezone(timezone.utc).isoformat(timespec="microseconds")

    @staticmethod
    def _mapping(value: Any) -> dict[str, Any]:
        return value if isinstance(value, dict) else {}

    @staticmethod
    def _first(mapping: dict[str, Any], *keys: str) -> Any:
        for key in keys:
            if key in mapping and mapping[key] is not None:
                return mapping[key]
        return None

    @staticmethod
    def _decision_id(decision: dict[str, Any]) -> str | None:
        value = CasperSubmissionGuard._first(decision, "decisionId", "decision_id")
        selected = str(value or "").strip()
        return selected or None

    @staticmethod
    def _normalized_string(value: Any) -> str:
        return str(value or "").strip()

    @staticmethod
    def _normalized_number(value: Any) -> int | float | str | None:
        if value is None or value == "":
            return None
        try:
            number = float(value)
        except (TypeError, ValueError):
            return str(value).strip()
        return int(number) if number.is_integer() else number

    @classmethod
    def _policy_gate_value(cls, value: Any) -> Any:
        if isinstance(value, dict):
            value = value.get("verdict") or value.get("status") or value
        normalized = cls._normalize_json(value)
        return normalized.lower() if isinstance(normalized, str) else normalized

    @classmethod
    def _normalize_json(cls, value: Any) -> Any:
        if isinstance(value, dict):
            normalized = {
                str(key): cls._normalize_json(item)
                for key, item in sorted(value.items(), key=lambda item: str(item[0]))
                if str(key) not in cls.VOLATILE_INTENT_KEYS
            }
            allowed_actions = normalized.get("allowedActions")
            if isinstance(allowed_actions, list):
                normalized["allowedActions"] = sorted(
                    allowed_actions,
                    key=lambda item: json.dumps(item, sort_keys=True, default=str),
                )
            return normalized
        if isinstance(value, (list, tuple)):
            return [cls._normalize_json(item) for item in value]
        if value is None or isinstance(value, (str, int, float, bool)):
            return value
        return str(value)


# Service-style name for callers that follow the other Casper module conventions.
CasperSubmissionGuardService = CasperSubmissionGuard
