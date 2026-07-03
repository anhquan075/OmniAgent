CASPER_TOOL_DESCRIPTIONS: dict[str, str] = {
    "casper_agent_cockpit_snapshot": "Read the Casper Buildathon agent cockpit snapshot.",
    "casper_get_account": "Read configured Casper Testnet account and signer readiness.",
    "casper_runtime_snapshot": "Read Casper runtime, preflight, and proof state.",
    "casper_live_preflight": "Check Casper Testnet account, contract, signer, and live-submit gates.",
    "casper_run_autonomous_cycle": "Run a guarded Casper decision cycle in dry-run or explicit live mode.",
    "casper_live_proof_bundle": "Read Casper decision proof, preflight blockers, and recovery hints.",
    "casper_get_deploy_status": "Read Casper deploy status metadata for a decision receipt.",
    "casper_get_decision_receipt": "Read a Casper decision receipt by decision id from the local proof ledger.",
    "casper_verify_decision_receipt": "Verify a decision receipt digest against recorded proof evidence.",
    "casper_record_decision": "Record or dry-run a Casper Testnet autonomous decision receipt.",
    "casper_record_readback": "Attach Casper contract readback evidence for a decision receipt.",
}

CASPER_OPERATOR_TOOL_NAMES = {
    "casper_record_decision",
    "casper_record_readback",
    "casper_run_autonomous_cycle",
}
