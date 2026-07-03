from pathlib import Path


def test_stack_verifier_uses_dashboard_proof_log() -> None:
    verifier = Path(__file__).resolve().parents[2] / "scripts" / "verify-casper-buildathon-stack.sh"
    text = verifier.read_text(encoding="utf-8")

    assert "proofs/casper-buildathon-submission-proof.json" not in text
    assert "plans/260702-1411-casper-agentic-buildathon-gap-closure" not in text
    assert "dashboard proof log" in text
    assert "/api/dashboard/receipts" in text
    assert "ledgerPath" in text


def test_live_proof_verifier_requires_receipt_dictionary() -> None:
    verifier = Path(__file__).resolve().parents[2] / "scripts" / "verify-casper-live-proof.sh"
    text = verifier.read_text(encoding="utf-8")

    assert "CASPER_DECISION_RECEIPT is missing" in text
    assert "proofs/casper-buildathon-submission-proof.json" not in text
    assert "latest_decision_receipt" in text
    assert "get-dictionary-item" in text
    assert "--dictionary-name decision_receipts" in text


def test_receipt_verifier_reads_dashboard_receipts() -> None:
    verifier = Path(__file__).resolve().parents[2] / "scripts" / "verify-casper-receipt.sh"
    text = verifier.read_text(encoding="utf-8")

    assert "/api/dashboard/receipts" in text
    assert "--ledger-path is deprecated" in text
    assert "backend/data/casper-decision" not in text


def test_receipt_verifier_checks_expected_public_metadata() -> None:
    verifier = Path(__file__).resolve().parents[2] / "scripts" / "verify-casper-receipt.sh"
    text = verifier.read_text(encoding="utf-8")

    assert "--expected-account" in text
    assert "--expected-contract-hash" in text
    assert "--expected-package-hash" in text
    assert "/api/public/proof" in text
    assert "ACCOUNT_MISMATCH" in text
    assert "CONTRACT_HASH_MISMATCH" in text
    assert "PACKAGE_HASH_MISMATCH" in text
