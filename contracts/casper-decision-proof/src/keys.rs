pub const CONTRACT_PACKAGE_NAME: &str = "omniagent_decision_proof_package";
pub const CONTRACT_ACCESS_UREF: &str = "omniagent_decision_proof_access";
pub const CONTRACT_KEY: &str = "omniagent_decision_proof";
pub const CONTRACT_VERSION_KEY: &str = "omniagent_decision_proof_version";
/// Account-side marker so upgrades seed `authorized_agent` exactly once.
pub const ACL_SEEDED_MARKER: &str = "omniagent_decision_proof_acl_seeded";
pub const ENTRY_POINT_RECORD: &str = "record_decision";
pub const ENTRY_POINT_LATEST_DIGEST: &str = "latest_proof_digest";
pub const ENTRY_POINT_LATEST_RECEIPT: &str = "latest_decision_receipt";
pub const ENTRY_POINT_GET_RECEIPT: &str = "get_decision_receipt";
pub const ENTRY_POINT_GET_AUTHORIZED_AGENT: &str = "get_authorized_agent";
pub const ENTRY_POINT_ROTATE_AUTHORIZED_AGENT: &str = "rotate_authorized_agent";
pub const DECISION_RECEIPTS_KEY: &str = "decision_receipts";
/// Install-time agent that may call `record_decision`. Bare 64-hex or `account-hash-…`.
pub const AUTHORIZED_AGENT_KEY: &str = "authorized_agent";
/// One-shot flag: upgrade session may rotate `authorized_agent` then clears it.
pub const ACL_ROTATION_ENABLED_KEY: &str = "acl_rotation_enabled";
pub const LATEST_DECISION_ID_KEY: &str = "latest_decision_id";
pub const LATEST_ACTION_KEY: &str = "latest_action";
pub const LATEST_PROOF_DIGEST_KEY: &str = "latest_proof_digest";
pub const LATEST_RATIONALE_HASH_KEY: &str = "latest_rationale_hash";
pub const LATEST_SOURCE_HASH_KEY: &str = "latest_source_hash";
pub const LATEST_TIMESTAMP_KEY: &str = "latest_timestamp";
pub const LATEST_RISK_SCORE_KEY: &str = "latest_risk_score";
pub const LATEST_POLICY_GATE_KEY: &str = "latest_policy_gate";
pub const LATEST_AGENT_ACCOUNT_HASH_KEY: &str = "latest_agent_account_hash";
pub const LATEST_GUARDRAIL_HASH_KEY: &str = "latest_guardrail_hash";
pub const LATEST_RECEIPT_KEY: &str = "latest_decision_receipt";
