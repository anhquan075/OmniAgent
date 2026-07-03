use alloc::{
    string::{String, ToString},
    vec,
    vec::Vec,
};
use casper_contract::{
    contract_api::{runtime, storage},
    unwrap_or_revert::UnwrapOrRevert,
};
use casper_types::{
    addressable_entity::{EntityEntryPoint as EntryPoint, EntryPoints},
    contracts::NamedKeys,
    CLType, EntryPointAccess, EntryPointPayment, EntryPointType, Parameter,
};

use crate::keys::*;

pub fn install_contract() {
    let (entry_points, named_keys) = (entry_points(), named_keys());
    let (contract_hash, contract_version) = storage::new_contract(
        entry_points,
        Some(named_keys),
        Some(CONTRACT_PACKAGE_NAME.to_string()),
        Some(CONTRACT_ACCESS_UREF.to_string()),
        None,
    );
    runtime::put_key(
        CONTRACT_VERSION_KEY,
        storage::new_uref(contract_version).into(),
    );
    runtime::put_key(CONTRACT_KEY, contract_hash.into());
}

fn named_keys() -> NamedKeys {
    let mut keys = NamedKeys::new();
    let receipt_uref = storage::new_dictionary(DECISION_RECEIPTS_KEY).unwrap_or_revert();
    keys.insert(DECISION_RECEIPTS_KEY.to_string(), receipt_uref.into());
    for key in [
        LATEST_DECISION_ID_KEY,
        LATEST_ACTION_KEY,
        LATEST_PROOF_DIGEST_KEY,
        LATEST_RATIONALE_HASH_KEY,
        LATEST_SOURCE_HASH_KEY,
        LATEST_TIMESTAMP_KEY,
        LATEST_POLICY_GATE_KEY,
        LATEST_AGENT_ACCOUNT_HASH_KEY,
        LATEST_GUARDRAIL_HASH_KEY,
        LATEST_RECEIPT_KEY,
    ] {
        keys.insert(key.to_string(), storage::new_uref(String::new()).into());
    }
    keys.insert(
        LATEST_RISK_SCORE_KEY.to_string(),
        storage::new_uref(0_u64).into(),
    );
    keys
}

fn entry_points() -> EntryPoints {
    let mut entry_points = EntryPoints::new();
    entry_points.add_entry_point(EntryPoint::new(
        ENTRY_POINT_RECORD,
        vec![
            Parameter::new("decision_id", CLType::String),
            Parameter::new("action", CLType::String),
            Parameter::new("proof_digest", CLType::String),
            Parameter::new("rationale_hash", CLType::String),
            Parameter::new("source_hash", CLType::String),
            Parameter::new("timestamp", CLType::String),
            Parameter::new("risk_score", CLType::U64),
            Parameter::new("policy_gate", CLType::String),
            Parameter::new("agent_account_hash", CLType::String),
            Parameter::new("guardrail_hash", CLType::String),
        ],
        CLType::Unit,
        EntryPointAccess::Public,
        EntryPointType::Called,
        EntryPointPayment::Caller,
    ));
    entry_points.add_entry_point(read_entry_point(ENTRY_POINT_LATEST_RECEIPT));
    entry_points.add_entry_point(read_entry_point(ENTRY_POINT_LATEST_DIGEST));
    entry_points.add_entry_point(EntryPoint::new(
        ENTRY_POINT_GET_RECEIPT,
        vec![Parameter::new("decision_id", CLType::String)],
        CLType::String,
        EntryPointAccess::Public,
        EntryPointType::Called,
        EntryPointPayment::Caller,
    ));
    entry_points
}

fn read_entry_point(name: &str) -> EntryPoint {
    EntryPoint::new(
        name,
        Vec::new(),
        CLType::String,
        EntryPointAccess::Public,
        EntryPointType::Called,
        EntryPointPayment::Caller,
    )
}
