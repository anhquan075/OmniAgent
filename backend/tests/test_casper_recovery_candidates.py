from app.services.casper.proof_bundle import CasperProofBundleService


def test_casper_recovery_candidates_do_not_suggest_duplicate_submit() -> None:
    candidates = CasperProofBundleService.recovery_candidates(
        [
            "casper_account_missing",
            "casper_deploy_not_confirmed",
            "casper_readback_digest_mismatch",
        ]
    )

    text = " ".join(item["action"].lower() for item in candidates)

    assert "duplicate" not in text
    assert "blind" not in text
    assert "configure casper_account_public_key" in text
    assert "poll" in text
    assert "read" in text
