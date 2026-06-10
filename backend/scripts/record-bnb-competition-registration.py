from __future__ import annotations

import argparse
from datetime import datetime, timezone

from app.services.shared.ledger import TradeLedger
from app.services.trading.registration import CompetitionRegistrationService
from app.services.wallet.agent_wallet import AgentWalletService
from script_logging import configure_script_logging, get_script_logger


logger = get_script_logger(__name__)


def run(args: argparse.Namespace) -> int:
    wallet_address = args.wallet_address or str(AgentWalletService.get_wallet_data().get("walletAddress") or "")
    proof = CompetitionRegistrationService.build_registration_proof(
        wallet_address=wallet_address,
        metadata_uri=args.metadata_uri,
        tx_hash=args.tx_hash,
        bridge_mode=args.bridge_mode,
    )
    if getattr(args, "receipt_proof_valid", False):
        proof["receiptProof"] = {
            "valid": True,
            "reasons": [],
            "source": "external_bsc_receipt",
            "status": args.receipt_status,
            "blockNumber": args.block_number,
            "eventTopic": args.event_topic,
            "verifiedAt": datetime.now(timezone.utc).isoformat(),
        }
    existing = TradeLedger.find_trade_event(tx_hash=str(proof["txHash"]), event_type="competition_registered")
    existing_payload = existing.get("payload") if isinstance(existing, dict) and isinstance(existing.get("payload"), dict) else {}
    existing_receipt_valid = CompetitionRegistrationService.registration_receipt_valid(existing_payload)
    if existing and (existing_receipt_valid or not getattr(args, "receipt_proof_valid", False)):
        logger.info("competition_registration_proof_already_recorded", txHash=proof["txHash"])
        return 0
    TradeLedger.append_event({
        "eventType": "competition_registered",
        "txHash": proof["txHash"],
        "payload": proof,
        "createdAt": datetime.now(timezone.utc).isoformat(),
    })
    logger.info("competition_registration_proof_recorded", txHash=proof["txHash"])
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Record a manually submitted BNB Hack competition registration tx.")
    parser.add_argument("--tx-hash", required=True, help="BSC transaction hash returned by TWAK competition registration.")
    parser.add_argument("--wallet-address", default="", help="Registered wallet. Defaults to configured agent wallet.")
    parser.add_argument("--metadata-uri", default="ipfs://omniagent")
    parser.add_argument("--bridge-mode", default="manual-twak-cli")
    parser.add_argument(
        "--receipt-proof-valid",
        action="store_true",
        help="Mark the registration receipt as externally verified from BscScan/RPC evidence.",
    )
    parser.add_argument("--receipt-status", default="success")
    parser.add_argument("--block-number", type=int, default=None)
    parser.add_argument("--event-topic", default="")
    return parser


def main() -> int:
    configure_script_logging()
    return run(build_parser().parse_args())


if __name__ == "__main__":
    raise SystemExit(main())
