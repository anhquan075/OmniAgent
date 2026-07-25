use alloc::{
    collections::BTreeMap,
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
    api_error::ApiError,
    contracts::NamedKeys,
    runtime_args, CLType, EntityAddr, EntryPointAccess, EntryPointPayment, EntryPointType, Key,
    Parameter,
};

use crate::keys::*;

pub fn install_contract() {
    if runtime::get_key(CONTRACT_ACCESS_UREF).is_some() {
        upgrade_contract();
        return;
    }
    let agent_account_hash: String = runtime::get_named_arg("agent_account_hash");
    let authorized = normalize_account_hash(&agent_account_hash);
    if authorized.is_empty() {
        runtime::revert(ApiError::InvalidArgument);
    }
    let (entry_points, mut named_keys) = (entry_points(), named_keys());
    named_keys.insert(
        AUTHORIZED_AGENT_KEY.to_string(),
        storage::new_uref(authorized).into(),
    );
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
    runtime::put_key(ACL_SEEDED_MARKER, storage::new_uref(true).into());
}

fn upgrade_contract() {
    let package_hash =
        match runtime::get_key(CONTRACT_PACKAGE_NAME).unwrap_or_revert_with(ApiError::MissingKey) {
            Key::Hash(hash) => hash,
            Key::AddressableEntity(EntityAddr::SmartContract(hash)) => hash,
            _ => runtime::revert(ApiError::UnexpectedKeyVariant),
        };
    // Seed authorized_agent on the first ACL-aware upgrade only. Empty NamedKeys
    // on later upgrades keep receipts and the already-stored agent intact.
    let mut new_keys = NamedKeys::default();
    let mut rotate_agent: Option<String> = None;
    if let Some(agent_account_hash) = runtime::try_get_named_arg::<String>("agent_account_hash") {
        let authorized = normalize_account_hash(&agent_account_hash);
        if authorized.is_empty() {
            runtime::revert(ApiError::InvalidArgument);
        }
        if runtime::get_key(ACL_SEEDED_MARKER).is_none() {
            new_keys.insert(
                AUTHORIZED_AGENT_KEY.to_string(),
                storage::new_uref(authorized.clone()).into(),
            );
            runtime::put_key(ACL_SEEDED_MARKER, storage::new_uref(true).into());
        } else {
            // Same-deploy rotation: enable one-shot overwrite of a bad seed.
            new_keys.insert(
                ACL_ROTATION_ENABLED_KEY.to_string(),
                storage::new_uref(true).into(),
            );
            rotate_agent = Some(authorized);
        }
    } else if runtime::get_key(ACL_SEEDED_MARKER).is_none() {
        runtime::revert(ApiError::MissingArgument);
    }
    let (contract_hash, contract_version) = storage::add_contract_version(
        package_hash.into(),
        entry_points(),
        new_keys,
        BTreeMap::new(),
    );
    runtime::put_key(
        CONTRACT_VERSION_KEY,
        storage::new_uref(contract_version).into(),
    );
    runtime::put_key(CONTRACT_KEY, contract_hash.into());
    if let Some(authorized) = rotate_agent {
        // Nobody else can interleave inside this deploy; flag is cleared by the callee.
        let _: () = runtime::call_contract(
            contract_hash,
            ENTRY_POINT_ROTATE_AUTHORIZED_AGENT,
            runtime_args! {
                "agent_account_hash" => authorized,
            },
        );
    }
}

/// Strip `account-hash-` / whitespace and lowercase so caller checks are format-stable.
pub fn normalize_account_hash(raw: &str) -> String {
    let trimmed = raw.trim();
    let bare = trimmed
        .strip_prefix("account-hash-")
        .or_else(|| trimmed.strip_prefix("ACCOUNT-HASH-"))
        .unwrap_or(trimmed)
        .trim();
    if bare.len() != 64 || !bare.bytes().all(|b| (b as char).is_ascii_hexdigit()) {
        return String::new();
    }
    bare.to_ascii_lowercase()
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
    entry_points.add_entry_point(EntryPoint::new(
        ENTRY_POINT_GET_AUTHORIZED_AGENT,
        Vec::new(),
        CLType::String,
        EntryPointAccess::Public,
        EntryPointType::Called,
        EntryPointPayment::Caller,
    ));
    entry_points.add_entry_point(EntryPoint::new(
        ENTRY_POINT_ROTATE_AUTHORIZED_AGENT,
        vec![Parameter::new("agent_account_hash", CLType::String)],
        CLType::Unit,
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
