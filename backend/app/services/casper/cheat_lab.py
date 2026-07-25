"""Cheat Lab — intentional on-chain reverts judges can click on /try.

Public scenarios map to contract User errors:
  - malformed_receipt → vault User(100)
  - unapproved_gate → vault User(102)
  - wrong_action → vault User(103)
  - tampered_authoritative_receipt → vault User(104)
  - unauthorized_recorder → decision-proof User(130)
  - forged_agent_identity → decision-proof User(131)

Default mode returns published canary deploy hashes (no keys / no gas).
Optional live mode submits a bad vault call when CASPER_CHEAT_LAB_LIVE_ENABLED=true;
decision-proof ACL scenarios are canary-only (OmniAgent is the authorized signer,
so it cannot reproduce User(130) against itself).
"""

from __future__ import annotations

from datetime import datetime, timezone
import json
from pathlib import Path
import threading
import time
from typing import Any

from app.core.settings import BACKEND_ROOT, REPO_ROOT, get_settings
from app.services.casper.submitter import CasperCliSubmitter
from app.services.casper.vault import CasperVaultService

SCENARIOS: tuple[dict[str, Any], ...] = (
    {
        "id": "malformed_receipt",
        "title": "Malformed receipt",
        "expectedUserError": 100,
        "entryPoint": "freeze",
        "errorLabel": "User error: 100",
        "explanation": (
            "Vault rejects a non-receipt string before any state change. "
            "Parse fails → ApiError::User(100)."
        ),
        "attack": "Call freeze with receipt='not-a-receipt'",
        "expectedOutcome": "Deploy executes and reverts; collateral stays unfrozen",
    },
    {
        "id": "unapproved_gate",
        "title": "Unapproved policy gate",
        "expectedUserError": 102,
        "entryPoint": "freeze",
        "errorLabel": "User error: 102",
        "explanation": (
            "A well-formed receipt with policy_gate=blocked cannot freeze. "
            "AI may debate; the chain is the final no."
        ),
        "attack": "Call freeze with a blocked decision receipt",
        "expectedOutcome": "Deploy reverts with User(102); no freeze",
    },
    {
        "id": "wrong_action",
        "title": "Wrong action for entry point",
        "expectedUserError": 103,
        "entryPoint": "freeze",
        "errorLabel": "User error: 103",
        "explanation": (
            "An approve receipt cannot drive freeze. Action must match the "
            "vault entry point (block→freeze / approve→unfreeze / haircut→set_ltv)."
        ),
        "attack": "Call freeze with an approve-action receipt",
        "expectedOutcome": "Deploy reverts with User(103); no freeze",
    },
    {
        "id": "tampered_authoritative_receipt",
        "title": "Tampered authoritative receipt",
        "expectedUserError": 104,
        "entryPoint": "enforce_verified",
        "errorLabel": "User error: 104",
        "explanation": (
            "The verified vault live-reads decision-proof by decision_id. "
            "A caller-modified receipt cannot substitute for the on-chain value."
        ),
        "attack": "Change proof_digest while keeping a real on-chain decision_id",
        "expectedOutcome": "Deploy reverts with User(104); LTV remains unchanged",
    },
    {
        "id": "unauthorized_recorder",
        "title": "Unauthorized decision recorder",
        "expectedUserError": 130,
        "entryPoint": "record_decision",
        "errorLabel": "User error: 130",
        "explanation": (
            "record_decision fail-closes unless the deploy signer is the "
            "installed agent account. Rogue accounts cannot plant approved receipts."
        ),
        "attack": "Call record_decision from a signer that is not the authorized agent",
        "expectedOutcome": "Deploy reverts with User(130); no receipt is written",
        "liveSupported": False,
    },
    {
        "id": "forged_agent_identity",
        "title": "Forged agent identity in receipt",
        "expectedUserError": 131,
        "entryPoint": "record_decision",
        "errorLabel": "User error: 131",
        "explanation": (
            "The receipt's agent_account_hash must equal the deploy signer. "
            "Even the authorized agent cannot attribute a decision to someone else."
        ),
        "attack": "Submit record_decision with agent_account_hash != deploy signer",
        "expectedOutcome": "Deploy reverts with User(131); no receipt is written",
        "liveSupported": False,
    },
)

_LIVE_LOCK = threading.Lock()
_LAST_LIVE_AT: dict[str, float] = {}


class CasperCheatLabService:
    @staticmethod
    def canaries_path() -> Path:
        """Resolve canary JSON path for judge-facing revert proofs.

        Preference order:
        1. ``CASPER_CHEAT_LAB_CANARIES_PATH`` (Railway volume ``/data/...``)
        2. Backend image ``data/cheat-lab-canaries.json`` (always shipped)
        3. Monorepo ``proofs/cheat-lab-canaries.json`` (local / CI checkout)
        """
        settings = get_settings()
        if settings.casper_cheat_lab_canaries_path:
            return Path(settings.casper_cheat_lab_canaries_path).expanduser()
        packaged = BACKEND_ROOT / "data" / "cheat-lab-canaries.json"
        if packaged.exists():
            return packaged
        return REPO_ROOT / "proofs" / "cheat-lab-canaries.json"

    @staticmethod
    def load_canaries() -> dict[str, Any]:
        path = CasperCheatLabService.canaries_path()
        if not path.exists():
            return {"updatedAt": None, "scenarios": {}}
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {"updatedAt": None, "scenarios": {}}
        if not isinstance(data, dict):
            return {"updatedAt": None, "scenarios": {}}
        scenarios = data.get("scenarios")
        if not isinstance(scenarios, dict):
            scenarios = {}
        return {
            "updatedAt": data.get("updatedAt"),
            "scenarios": scenarios,
        }

    @staticmethod
    def save_canaries(scenarios: dict[str, Any]) -> Path:
        path = CasperCheatLabService.canaries_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "updatedAt": datetime.now(timezone.utc).isoformat(),
            "network": get_settings().casper_network,
            "scenarios": scenarios,
        }
        path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        return path

    @staticmethod
    def list_scenarios() -> list[dict[str, Any]]:
        canaries = CasperCheatLabService.load_canaries().get("scenarios") or {}
        explorer = get_settings().casper_explorer_url.rstrip("/")
        items: list[dict[str, Any]] = []
        for scenario in SCENARIOS:
            canary = canaries.get(scenario["id"]) if isinstance(canaries, dict) else None
            canary = canary if isinstance(canary, dict) else {}
            tx_hash = str(canary.get("transactionHash") or "").strip() or None
            explorer_url = str(canary.get("explorerUrl") or "").strip() or None
            if tx_hash and not explorer_url and explorer:
                explorer_url = f"{explorer}/deploy/{tx_hash}"
            items.append(
                {
                    **scenario,
                    "status": "ready" if tx_hash else "canary_pending",
                    "transactionHash": tx_hash,
                    "explorerUrl": explorer_url,
                    "errorMessage": canary.get("errorMessage") or scenario["errorLabel"],
                    "recordedAt": canary.get("recordedAt"),
                    "liveEnabled": bool(get_settings().casper_cheat_lab_live_enabled),
                }
            )
        return items

    @staticmethod
    def public_cheat_reverts() -> dict[str, Any]:
        items = CasperCheatLabService.list_scenarios()
        ready = [item for item in items if item.get("transactionHash")]
        return {
            "status": "ready" if len(ready) == len(items) else "partial" if ready else "pending",
            "count": len(items),
            "readyCount": len(ready),
            "liveEnabled": bool(get_settings().casper_cheat_lab_live_enabled),
            "tryPath": "/try",
            "endpoint": "/api/public/cheat",
            "scenarios": items,
        }

    @staticmethod
    def get_scenario(scenario_id: str) -> dict[str, Any] | None:
        for item in CasperCheatLabService.list_scenarios():
            if item["id"] == scenario_id:
                return item
        return None

    @staticmethod
    def build_attack_args(scenario_id: str) -> dict[str, Any]:
        """Build the intentional bad vault call arguments for a scenario."""
        settings = get_settings()
        decision_id = f"cheat-{scenario_id}-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
        if scenario_id == "malformed_receipt":
            return {
                "entryPoint": "freeze",
                "assetId": settings.casper_vault_asset_id,
                "decisionId": decision_id,
                "receipt": "not-a-receipt",
                "expectedUserError": 100,
            }
        if scenario_id == "unapproved_gate":
            return {
                "entryPoint": "freeze",
                "assetId": settings.casper_vault_asset_id,
                "decisionId": decision_id,
                "receipt": CasperCheatLabService._receipt(
                    decision_id=decision_id,
                    action="block",
                    policy_gate="blocked",
                ),
                "expectedUserError": 102,
            }
        if scenario_id == "wrong_action":
            return {
                "entryPoint": "freeze",
                "assetId": settings.casper_vault_asset_id,
                "decisionId": decision_id,
                "receipt": CasperCheatLabService._receipt(
                    decision_id=decision_id,
                    action="approve",
                    policy_gate="approved",
                ),
                "expectedUserError": 103,
            }
        if scenario_id == "unauthorized_recorder":
            return {
                "entryPoint": "record_decision",
                "decisionId": decision_id,
                "attackNote": "sign with a non-agent account",
                "liveSupported": False,
                "expectedUserError": 130,
            }
        if scenario_id == "forged_agent_identity":
            return {
                "entryPoint": "record_decision",
                "decisionId": decision_id,
                "agentAccountHash": "00" * 31 + "01",
                "liveSupported": False,
                "expectedUserError": 131,
            }
        if scenario_id == "tampered_authoritative_receipt":
            from app.services.casper.proof_bundle import CasperProofBundleService

            bundle = CasperProofBundleService.get_live_proof_bundle({"limit": 10})
            decision = (
                bundle.get("latestDecision")
                if isinstance(bundle.get("latestDecision"), dict)
                else {}
            )
            authoritative_id = str(decision.get("decisionId") or "")
            receipt_obj = decision.get("decisionReceipt")
            authoritative_receipt = (
                str(receipt_obj.get("receiptValue") or "")
                if isinstance(receipt_obj, dict)
                else str(receipt_obj or "")
            )
            if not authoritative_id or not authoritative_receipt:
                raise ValueError("authoritative decision receipt unavailable")
            parts = authoritative_receipt.split("|")
            if len(parts) < 10:
                raise ValueError("authoritative decision receipt malformed")
            parts[3] = "sha256:tampered"
            return {
                "entryPoint": "set_ltv",
                "assetId": settings.casper_vault_asset_id,
                "decisionId": authoritative_id,
                "receipt": "|".join(parts),
                "ltvBps": 2500,
                "verified": True,
                "expectedUserError": 104,
            }
        raise ValueError(f"unknown cheat scenario: {scenario_id}")

    @staticmethod
    def _receipt(*, decision_id: str, action: str, policy_gate: str) -> str:
        now = datetime.now(timezone.utc).isoformat()
        return "|".join(
            [
                decision_id,
                action,
                "99",
                "sha256:cheat-proof",
                "sha256:cheat-rationale",
                "sha256:cheat-source",
                now,
                policy_gate,
                "sha256:cheat-agent",
                "sha256:cheat-guardrail",
            ]
        )

    @staticmethod
    def run_scenario(scenario_id: str, *, live: bool = False) -> dict[str, Any]:
        scenario = CasperCheatLabService.get_scenario(scenario_id)
        if scenario is None:
            return {
                "ok": False,
                "status": "unknown_scenario",
                "hardBlockers": ["cheat_scenario_unknown"],
                "scenarioId": scenario_id,
            }
        if live:
            return CasperCheatLabService._run_live(scenario)
        return CasperCheatLabService._run_canary(scenario)

    @staticmethod
    def _run_canary(scenario: dict[str, Any]) -> dict[str, Any]:
        tx_hash = scenario.get("transactionHash")
        if not tx_hash:
            return {
                "ok": False,
                "status": "canary_pending",
                "mode": "canary",
                "scenarioId": scenario["id"],
                "title": scenario["title"],
                "expectedUserError": scenario["expectedUserError"],
                "errorLabel": scenario["errorLabel"],
                "explanation": scenario["explanation"],
                "attack": scenario["attack"],
                "expectedOutcome": scenario["expectedOutcome"],
                "hardBlockers": ["cheat_canary_missing"],
                "hint": (
                    "Publish explorer proofs with: "
                    "cd backend && uv run python scripts/cheat_lab_seed.py"
                ),
            }
        return {
            "ok": True,
            "status": "reverted",
            "mode": "canary",
            "scenarioId": scenario["id"],
            "title": scenario["title"],
            "expectedUserError": scenario["expectedUserError"],
            "errorLabel": scenario["errorLabel"],
            "errorMessage": scenario.get("errorMessage") or scenario["errorLabel"],
            "explanation": scenario["explanation"],
            "attack": scenario["attack"],
            "expectedOutcome": scenario["expectedOutcome"],
            "transactionHash": tx_hash,
            "explorerUrl": scenario.get("explorerUrl"),
            "recordedAt": scenario.get("recordedAt"),
            "hardBlockers": [],
        }

    @staticmethod
    def _run_live(scenario: dict[str, Any]) -> dict[str, Any]:
        settings = get_settings()
        if not settings.casper_cheat_lab_live_enabled:
            return {
                "ok": False,
                "status": "live_disabled",
                "mode": "live",
                "scenarioId": scenario["id"],
                "hardBlockers": ["cheat_lab_live_disabled"],
                "hint": "Set CASPER_CHEAT_LAB_LIVE_ENABLED=true to submit intentional reverts.",
            }
        scenario_id = str(scenario["id"])
        if scenario.get("liveSupported") is False:
            # Decision-proof ACL reverts cannot be reproduced by the authorized
            # signer; the published canary is the proof.
            canary = CasperCheatLabService._run_canary(scenario)
            canary["mode"] = "canary_fallback"
            return canary
        now = time.monotonic()
        with _LIVE_LOCK:
            last = _LAST_LIVE_AT.get(scenario_id, 0.0)
            wait = settings.casper_cheat_lab_live_min_interval_sec - (now - last)
            if wait > 0:
                return {
                    "ok": False,
                    "status": "rate_limited",
                    "mode": "live",
                    "scenarioId": scenario_id,
                    "retryAfterSec": int(wait) + 1,
                    "hardBlockers": ["cheat_lab_rate_limited"],
                }
            # Fall back to canary while holding the lock reservation intent.
            verified = scenario_id == "tampered_authoritative_receipt"
            configured = (
                settings.casper_vault_verified_contract_hash
                or settings.casper_vault_verified_package_hash
                if verified
                else settings.casper_vault_contract_hash or settings.casper_vault_package_hash
            )
            if not configured:
                canary = CasperCheatLabService._run_canary(scenario)
                canary["mode"] = "canary_fallback"
                canary["hardBlockers"] = list(canary.get("hardBlockers") or []) + [
                    "casper_vault_contract_missing"
                ]
                return canary
            _LAST_LIVE_AT[scenario_id] = now

        attack = CasperCheatLabService.build_attack_args(scenario_id)
        submit = CasperVaultService.submit_entry(
            entry_point=str(attack["entryPoint"]),
            asset_id=str(attack["assetId"]),
            decision_id=str(attack["decisionId"]),
            receipt=str(attack["receipt"]),
            ltv_bps=int(attack.get("ltvBps") or 5000),
            verified=bool(attack.get("verified")),
        )
        if not submit.get("submitted"):
            # Prefer serving the canary so judges still see a revert proof.
            canary = CasperCheatLabService._run_canary(scenario)
            if canary.get("ok"):
                canary["mode"] = "canary_fallback"
                canary["liveAttempt"] = submit
                return canary
            return {
                "ok": False,
                "status": "submit_blocked",
                "mode": "live",
                "scenarioId": scenario_id,
                "hardBlockers": submit.get("hardBlockers") or ["cheat_live_submit_blocked"],
                "liveAttempt": submit,
            }

        tx_hash = str(submit.get("transactionHash") or "")
        poll = CasperCheatLabService._poll_until_settled(tx_hash)
        error_message = poll.get("errorMessage") or scenario["errorLabel"]
        user_error = poll.get("userErrorCode") or scenario["expectedUserError"]
        explorer_url = submit.get("explorerUrl")
        recorded = {
            "transactionHash": tx_hash,
            "explorerUrl": explorer_url,
            "errorMessage": error_message,
            "userErrorCode": user_error,
            "recordedAt": datetime.now(timezone.utc).isoformat(),
            "decisionId": attack["decisionId"],
            "entryPoint": attack["entryPoint"],
            "status": poll.get("status"),
        }
        if poll.get("status") == "failed":
            CasperCheatLabService._upsert_canary(scenario_id, recorded)
        return {
            "ok": poll.get("status") == "failed",
            "status": "reverted" if poll.get("status") == "failed" else poll.get("status"),
            "mode": "live",
            "scenarioId": scenario_id,
            "title": scenario["title"],
            "expectedUserError": scenario["expectedUserError"],
            "observedUserError": user_error,
            "errorLabel": scenario["errorLabel"],
            "errorMessage": error_message,
            "explanation": scenario["explanation"],
            "attack": scenario["attack"],
            "expectedOutcome": scenario["expectedOutcome"],
            "transactionHash": tx_hash,
            "explorerUrl": explorer_url,
            "recordedAt": recorded["recordedAt"],
            "hardBlockers": []
            if poll.get("status") == "failed"
            else list(poll.get("hardBlockers") or ["cheat_live_not_reverted"]),
        }

    @staticmethod
    def _poll_until_settled(tx_hash: str) -> dict[str, Any]:
        settings = get_settings()
        last: dict[str, Any] = {"status": "pending_or_unverified", "hardBlockers": []}
        for _ in range(max(1, settings.casper_cheat_lab_poll_max_retries)):
            last = CasperCliSubmitter.get_transaction_status(tx_hash)
            if last.get("status") in {"failed", "confirmed"}:
                return last
            time.sleep(settings.casper_cheat_lab_poll_interval_sec)
        return last

    @staticmethod
    def _upsert_canary(scenario_id: str, recorded: dict[str, Any]) -> None:
        store = CasperCheatLabService.load_canaries()
        scenarios = dict(store.get("scenarios") or {})
        scenarios[scenario_id] = recorded
        CasperCheatLabService.save_canaries(scenarios)

    @staticmethod
    def seed_all(*, dry_run: bool = False) -> dict[str, Any]:
        """Submit every Cheat Lab scenario, or print the attack arguments."""
        results: list[dict[str, Any]] = []
        for scenario in SCENARIOS:
            scenario_id = str(scenario["id"])
            attack = CasperCheatLabService.build_attack_args(scenario_id)
            if dry_run:
                results.append({"scenarioId": scenario_id, "dryRun": True, "attack": attack})
                continue
            if attack.get("liveSupported") is False:
                results.append(
                    {
                        "ok": True,
                        "scenarioId": scenario_id,
                        "status": "canary_only",
                        "hardBlockers": [],
                    }
                )
                continue
            submit = CasperVaultService.submit_entry(
                entry_point=str(attack["entryPoint"]),
                asset_id=str(attack["assetId"]),
                decision_id=str(attack["decisionId"]),
                receipt=str(attack["receipt"]),
                ltv_bps=int(attack.get("ltvBps") or 5000),
                verified=bool(attack.get("verified")),
            )
            if not submit.get("submitted"):
                results.append(
                    {
                        "ok": False,
                        "scenarioId": scenario_id,
                        "status": "submit_blocked",
                        "hardBlockers": submit.get("hardBlockers") or [],
                        "liveAttempt": submit,
                    }
                )
                continue
            tx_hash = str(submit.get("transactionHash") or "")
            poll = CasperCheatLabService._poll_until_settled(tx_hash)
            recorded = {
                "transactionHash": tx_hash,
                "explorerUrl": submit.get("explorerUrl"),
                "errorMessage": poll.get("errorMessage") or scenario["errorLabel"],
                "userErrorCode": poll.get("userErrorCode") or scenario["expectedUserError"],
                "recordedAt": datetime.now(timezone.utc).isoformat(),
                "decisionId": attack["decisionId"],
                "entryPoint": attack["entryPoint"],
                "status": poll.get("status"),
            }
            if poll.get("status") == "failed":
                CasperCheatLabService._upsert_canary(scenario_id, recorded)
            results.append(
                {
                    "ok": poll.get("status") == "failed",
                    "scenarioId": scenario_id,
                    "status": "reverted" if poll.get("status") == "failed" else poll.get("status"),
                    **recorded,
                    "hardBlockers": []
                    if poll.get("status") == "failed"
                    else list(poll.get("hardBlockers") or ["cheat_seed_not_reverted"]),
                }
            )
        return {
            "dryRun": dry_run,
            "results": results,
            "canariesPath": str(CasperCheatLabService.canaries_path()),
            "public": CasperCheatLabService.public_cheat_reverts(),
        }
