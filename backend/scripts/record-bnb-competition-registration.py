from __future__ import annotations

import argparse
from datetime import datetime, timezone

from loguru import logger

from app.services.shared.ledger import TradeLedger
from app.services.trading.registration import CompetitionRegistrationService
from app.services.wallet.agent_wallet import AgentWalletService
from script_logging import configure_script_logging


def run(args: argparse.Namespace) -> int:
    wallet_address = args.wallet_address or str(AgentWalletService.get_wallet_data().get("walletAddress") or "")
    proof = CompetitionRegistrationService.build_registration_proof(
        wallet_address=wallet_address,
        metadata_uri=args.metadata_uri,
        tx_hash=args.tx_hash,
        bridge_mode=args.bridge_mode,
    )
    existing = TradeLedger.find_trade_event(tx_hash=str(proof["txHash"]), event_type="competition_registered")
    if existing:
        logger.success("competition registration proof already recorded: {}", proof["txHash"])
        return 0
    TradeLedger.append_event({
        "eventType": "competition_registered",
        "txHash": proof["txHash"],
        "payload": proof,
        "createdAt": datetime.now(timezone.utc).isoformat(),
    })
    logger.success("recorded competition registration proof: {}", proof["txHash"])
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Record a manually submitted BNB Hack competition registration tx.")
    parser.add_argument("--tx-hash", required=True, help="BSC transaction hash returned by TWAK competition registration.")
    parser.add_argument("--wallet-address", default="", help="Registered wallet. Defaults to configured agent wallet.")
    parser.add_argument("--metadata-uri", default="ipfs://omniagent")
    parser.add_argument("--bridge-mode", default="manual-twak-cli")
    return parser


def main() -> int:
    configure_script_logging()
    return run(build_parser().parse_args())


if __name__ == "__main__":
    raise SystemExit(main())
