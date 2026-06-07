import hashlib
import json
from typing import Any


class TradeProofDigestService:
    @classmethod
    def digest(
        cls,
        *,
        trade_intent_id: object = None,
        submission: dict[str, Any] | None = None,
        receipt: dict[str, Any] | None = None,
        preflight: dict[str, Any] | None = None,
    ) -> str:
        payload = {
            "tradeIntentId": trade_intent_id or (submission or {}).get("tradeIntentId"),
            "cmc": cls._cmc_digest(submission, preflight),
            "risk": cls._risk_digest(submission),
            "route": cls._route_digest(submission, preflight),
            "twakBridgeMode": cls._bridge_mode(submission, receipt),
            "txHash": (receipt or {}).get("txHash") or (submission or {}).get("txHash"),
            "receipt": cls._receipt_digest(receipt),
        }
        text = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
        return hashlib.sha256(text.encode("utf-8")).hexdigest()

    @classmethod
    def duplicate_status(
        cls,
        digest: str,
        ledger: dict[str, Any],
        current_tx_hash: object = None,
        current_trade_intent_id: object = None,
    ) -> dict[str, Any]:
        matches: list[dict[str, Any]] = []
        for event in ledger.get("events") or []:
            if not isinstance(event, dict):
                continue
            payload = event.get("payload") if isinstance(event.get("payload"), dict) else {}
            event_digest = payload.get("proofDigest")
            event_tx = event.get("txHash") or payload.get("txHash")
            event_intent = event.get("tradeIntentId")
            self_match = (
                current_tx_hash
                and event_tx == current_tx_hash
                and current_trade_intent_id
                and event_intent == current_trade_intent_id
            )
            if self_match:
                continue
            if event_digest == digest or (current_tx_hash and event_tx == current_tx_hash):
                matches.append({
                    "eventType": event.get("eventType"),
                    "tradeIntentId": event.get("tradeIntentId"),
                    "txHash": event_tx,
                })
        return {"duplicate": bool(matches), "matches": matches, "digest": digest}

    @staticmethod
    def _cmc_digest(submission: dict[str, Any] | None, preflight: dict[str, Any] | None) -> dict[str, Any]:
        payload = submission.get("payload") if isinstance(submission, dict) else {}
        signal = payload.get("cmcAgentHubSignal") if isinstance(payload, dict) else None
        if not isinstance(signal, dict):
            signal = (preflight or {}).get("cmcAgentHubSignal")
        signal = signal if isinstance(signal, dict) else {}
        return {
            "toolName": signal.get("toolName"),
            "ready": bool(signal.get("ready")),
            "serverVerified": bool(signal.get("serverVerified")),
            "timestamp": signal.get("timestamp"),
            "outputDigest": TradeProofDigestService._stable_digest(signal.get("parsedContent")),
        }

    @staticmethod
    def _risk_digest(submission: dict[str, Any] | None) -> str | None:
        payload = submission.get("payload") if isinstance(submission, dict) else {}
        return TradeProofDigestService._stable_digest(payload.get("risk")) if isinstance(payload, dict) else None

    @staticmethod
    def _route_digest(submission: dict[str, Any] | None, preflight: dict[str, Any] | None) -> str | None:
        payload = submission.get("payload") if isinstance(submission, dict) else {}
        route = payload.get("quote") if isinstance(payload, dict) else None
        if route is None:
            route = (preflight or {}).get("fundedStrategy")
        return TradeProofDigestService._stable_digest(route)

    @staticmethod
    def _bridge_mode(submission: dict[str, Any] | None, receipt: dict[str, Any] | None) -> object:
        payload = submission.get("payload") if isinstance(submission, dict) else {}
        proof = receipt.get("submissionProof") if isinstance(receipt, dict) else {}
        return (payload or {}).get("bridgeMode") or (proof or {}).get("bridgeMode")

    @staticmethod
    def _receipt_digest(receipt: dict[str, Any] | None) -> dict[str, Any]:
        proof = receipt.get("proof") if isinstance(receipt, dict) else {}
        return {
            "status": receipt.get("status") if isinstance(receipt, dict) else None,
            "blockNumber": receipt.get("blockNumber") if isinstance(receipt, dict) else None,
            "proofValid": bool(isinstance(proof, dict) and proof.get("valid")),
            "proofReasons": proof.get("reasons") if isinstance(proof, dict) else [],
        }

    @staticmethod
    def _stable_digest(value: object) -> str | None:
        if value is None:
            return None
        scrubbed = TradeProofDigestService._scrub(value)
        text = json.dumps(scrubbed, sort_keys=True, separators=(",", ":"), default=str)
        return hashlib.sha256(text.encode("utf-8")).hexdigest()

    @staticmethod
    def _scrub(value: object) -> object:
        if isinstance(value, dict):
            return {
                str(key): TradeProofDigestService._scrub(item)
                for key, item in value.items()
                if "secret" not in str(key).lower()
                and "key" not in str(key).lower()
                and "header" not in str(key).lower()
                and "token" not in str(key).lower()
            }
        if isinstance(value, list):
            return [TradeProofDigestService._scrub(item) for item in value[:20]]
        return value
