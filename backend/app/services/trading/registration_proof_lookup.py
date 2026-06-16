import re

from app.core.settings import get_settings
from app.services.shared.ledger import TradeLedger
from app.services.trading.bundled_registration_proof import BundledRegistrationProof
from app.services.wallet.agent_wallet import AgentWalletService


TX_RE = re.compile(r"^0x[a-fA-F0-9]{64}$")


class RegistrationProofLookup:
    @staticmethod
    def find(wallet_address: str | None = None, *, include_bundled: bool = False) -> dict[str, object] | None:
        settings = get_settings()
        expected_wallet = str(wallet_address or AgentWalletService.get_wallet_data().get("walletAddress") or "")
        use_bundled = include_bundled or settings.bnb_bundled_registration_proof_enabled
        events = [
            *(BundledRegistrationProof.events() if use_bundled else []),
            *TradeLedger._read_events(settings.trade_ledger_path),
        ]
        for event in reversed(events):
            if isinstance(event, dict) and RegistrationProofLookup.valid_event(event, expected_wallet):
                return event
        return None

    @staticmethod
    def valid_event(event: dict[str, object], expected_wallet: str) -> bool:
        if event.get("eventType") != "competition_registered":
            return False
        settings = get_settings()
        payload = event.get("payload") if isinstance(event.get("payload"), dict) else {}
        tx_hash = str(event.get("txHash") or payload.get("txHash") or "")
        contract_address = str(payload.get("competitionContractAddress") or "")
        chain_id = int(payload.get("chainId") or 0)
        proof_wallet = str(payload.get("walletAddress") or "")
        receipt_proof = payload.get("receiptProof")
        return bool(
            isinstance(receipt_proof, dict)
            and receipt_proof.get("valid") is True
            and TX_RE.match(tx_hash)
            and RegistrationProofLookup.same_address(proof_wallet, expected_wallet)
            and RegistrationProofLookup.same_address(contract_address, settings.bnb_competition_contract_address)
            and chain_id == settings.bnb_chain_id
        )

    @staticmethod
    def same_address(left: object, right: object) -> bool:
        return isinstance(left, str) and isinstance(right, str) and left.lower() == right.lower()
