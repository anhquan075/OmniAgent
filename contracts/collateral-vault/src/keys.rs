// The authoritative vault is a separate package so the legacy vault remains
// available for an immediate environment-variable rollback.
pub const CONTRACT_PACKAGE_NAME: &str = "omniagent_vault_v3_package";
pub const CONTRACT_ACCESS_UREF: &str = "omniagent_vault_v3_access";
pub const CONTRACT_KEY: &str = "omniagent_vault_v3";
pub const CONTRACT_VERSION_KEY: &str = "omniagent_vault_v3_version";

pub const ENTRY_POINT_DEPOSIT: &str = "deposit";
pub const ENTRY_POINT_FREEZE: &str = "freeze";
pub const ENTRY_POINT_UNFREEZE: &str = "unfreeze";
pub const ENTRY_POINT_SET_LTV: &str = "set_ltv";
pub const ENTRY_POINT_ENFORCE_VERIFIED: &str = "enforce_verified";
pub const ENTRY_POINT_GET_POSITION: &str = "get_position";
pub const ENTRY_POINT_IS_FROZEN: &str = "is_frozen";
pub const ENTRY_POINT_GET_LTV: &str = "get_ltv";

pub const POSITIONS_KEY: &str = "positions_v3";
pub const PROOF_CONTRACT_HASH_KEY: &str = "proof_contract_hash";
pub const AGENT_ACCOUNT_HASH_KEY: &str = "agent_account_hash";
pub const LAST_DECISION_ID_KEY: &str = "last_decision_id";
pub const LAST_ACTION_KEY: &str = "last_action";
pub const LAST_RECEIPT_KEY: &str = "last_enforced_receipt";
