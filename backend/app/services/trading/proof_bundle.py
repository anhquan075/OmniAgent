from app.services.shared.ledger import TradeLedger
from app.services.trading.live_preflight import LivePreflightService
from app.services.trading.proof_digest import TradeProofDigestService
from app.services.trading.proof_score import TradeProofScoreService
from app.services.trading.receipt import ReceiptProofService
from app.services.trading.recovery_candidates import TradeRecoveryCandidateService
from app.services.trading.trade_work_order import TradeWorkOrderService

class ProofBundleService:
    @staticmethod
    async def get_live_proof_bundle(args: dict[str, object]) -> dict[str, object]:
        limit = int(args.get("limit") or 8)
        refresh_receipt = bool(args.get("refreshReceipt"))
        preflight = await LivePreflightService.get_live_preflight({
            **args,
            "skipFundedCycle": not refresh_receipt,
        })
        ledger = TradeLedger.get_ledger_summary(limit=limit)
        latest_submission = TradeLedger.latest_trade_event("trade_executed")
        latest_receipt = await ProofBundleService.latest_receipt_status(
            latest_submission,
            refresh=refresh_receipt,
        )
        proof_digest = TradeProofDigestService.digest(
            trade_intent_id=(latest_submission or {}).get("tradeIntentId"),
            submission=latest_submission,
            receipt=latest_receipt,
            preflight=preflight,
        )
        lifecycle = TradeWorkOrderService.from_proof_bundle(
            preflight,
            ledger,
            latest_receipt,
            latest_submission,
        )
        proof_score = TradeProofScoreService.score(
            preflight=preflight,
            ledger=ledger,
            receipt=latest_receipt,
            submission=latest_submission,
        )
        recovery = TradeRecoveryCandidateService.list_candidates(
            preflight=preflight,
            ledger=ledger,
            receipt=latest_receipt,
            submission=latest_submission,
        )
        return {
            "network": "bsc",
            "status": "ready_for_live_trade" if preflight.get("readyForLiveTrade") else "blocked",
            "readyForLiveTrade": bool(preflight.get("readyForLiveTrade")),
            "readyToEnableLive": bool(preflight.get("readyToEnableLive")),
            "blockers": preflight.get("blockers") or [],
            "workOrderLifecycle": lifecycle,
            "proofScore": proof_score,
            "proofDigest": proof_digest,
            "duplicateProof": TradeProofDigestService.duplicate_status(
                proof_digest,
                ledger,
                (latest_receipt or {}).get("txHash") or (latest_submission or {}).get("txHash"),
                (latest_submission or {}).get("tradeIntentId"),
            ),
            "recoveryCandidates": recovery,
            "latestSubmission": latest_submission,
            "latestReceiptStatus": latest_receipt,
            "dailyCompliance": ledger.get("dailyCompliance"),
            "txEvents": ledger.get("txEvents"),
            "ledgerPath": ledger.get("ledgerPath"),
            "nextActions": ProofBundleService.next_actions(preflight),
        }

    @staticmethod
    async def latest_receipt_status(
        event: dict[str, object] | None,
        refresh: bool = False,
    ) -> dict[str, object] | None:
        if not event:
            return None
        tx_hash = event.get("txHash")
        if not isinstance(tx_hash, str):
            return None
        cached = TradeLedger.find_trade_event(tx_hash=tx_hash, event_type="trade_receipt_confirmed")
        if cached and not refresh:
            payload = cached.get("payload") if isinstance(cached.get("payload"), dict) else {}
            return {
                "network": "bsc",
                "txHash": tx_hash,
                "status": "confirmed",
                "blockNumber": payload.get("blockNumber"),
                "from": payload.get("from"),
                "to": payload.get("to"),
                "explorerUrl": payload.get("explorerUrl"),
                "submissionProof": payload.get("submissionProof"),
                "proof": payload.get("proof") if isinstance(payload.get("proof"), dict) else {"valid": True, "reasons": []},
                "ledgerEvent": cached,
                "source": "ledger",
            }
        if not refresh:
            return {
                "network": "bsc",
                "txHash": tx_hash,
                "status": "not_polled",
                "submissionProof": ReceiptProofService.find_submission_proof(
                    tx_hash,
                    str(event.get("tradeIntentId") or ""),
                ),
                "proof": {"valid": False, "reasons": ["receipt_not_polled"]},
                "source": "ledger",
            }
        return await ReceiptProofService.get_trade_status({
            "txHash": tx_hash,
            "tradeIntentId": event.get("tradeIntentId"),
        })

    @staticmethod
    def next_actions(preflight: dict[str, object]) -> list[str]:
        actions: list[str] = []
        for blocker in preflight.get("blockers") or []:
            if not isinstance(blocker, dict):
                continue
            name = str(blocker.get("name") or "")
            if name == "cmc_agent_hub_signal":
                actions.append("Set a CMC key; the backend auto-discovers a signal tool, or pin one with backend/scripts/configure-cmc-signal-tool.py.")
            elif name == "cmc_agent_hub" or name == "cmc":
                actions.append("Set one CMC key in backend/.env or the shell environment.")
            elif name == "live_flags":
                actions.append("Enable BNB_TRADING_ENABLED and ALLOW_AGENT_RUN only after live readiness is clean.")
            elif name == "funded_route" or name == "capital":
                actions.append("Fund the TWAK agent wallet with gas BNB and an eligible in-scope asset.")
            elif name == "twak":
                actions.append("Start and validate the TWAK REST bridge on the configured agent wallet.")
            elif name == "competition":
                actions.append("Register the agent wallet with bnb_competition_register before live trading.")
        return ProofBundleService.dedupe(actions)

    @staticmethod
    def dedupe(items: list[str]) -> list[str]:
        seen: set[str] = set()
        result: list[str] = []
        for item in items:
            if item not in seen:
                seen.add(item)
                result.append(item)
        return result
