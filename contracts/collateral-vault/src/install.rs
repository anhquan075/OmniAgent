use alloc::{
    string::{String, ToString},
    vec,
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
    let proof_contract_hash: String = runtime::get_named_arg("proof_contract_hash");
    let agent_account_hash: String = runtime::get_named_arg("agent_account_hash");
    let (entry_points, mut named_keys) = (entry_points(), named_keys());
    named_keys.insert(
        PROOF_CONTRACT_HASH_KEY.to_string(),
        storage::new_uref(proof_contract_hash).into(),
    );
    named_keys.insert(
        AGENT_ACCOUNT_HASH_KEY.to_string(),
        storage::new_uref(agent_account_hash).into(),
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
}

fn named_keys() -> NamedKeys {
    let mut keys = NamedKeys::new();
    let positions = storage::new_dictionary(POSITIONS_KEY).unwrap_or_revert();
    keys.insert(POSITIONS_KEY.to_string(), positions.into());
    keys.insert(
        LAST_DECISION_ID_KEY.to_string(),
        storage::new_uref(String::new()).into(),
    );
    keys.insert(
        LAST_ACTION_KEY.to_string(),
        storage::new_uref(String::new()).into(),
    );
    keys.insert(
        LAST_RECEIPT_KEY.to_string(),
        storage::new_uref(String::new()).into(),
    );
    keys
}

fn entry_points() -> EntryPoints {
    let mut entry_points = EntryPoints::new();
    entry_points.add_entry_point(EntryPoint::new(
        ENTRY_POINT_DEPOSIT,
        vec![
            Parameter::new("asset_id", CLType::String),
            Parameter::new("amount", CLType::U64),
        ],
        CLType::Unit,
        EntryPointAccess::Public,
        EntryPointType::Called,
        EntryPointPayment::Caller,
    ));
    entry_points.add_entry_point(EntryPoint::new(
        ENTRY_POINT_FREEZE,
        vec![
            Parameter::new("asset_id", CLType::String),
            Parameter::new("decision_id", CLType::String),
            Parameter::new("receipt", CLType::String),
        ],
        CLType::Unit,
        EntryPointAccess::Public,
        EntryPointType::Called,
        EntryPointPayment::Caller,
    ));
    entry_points.add_entry_point(EntryPoint::new(
        ENTRY_POINT_UNFREEZE,
        vec![
            Parameter::new("asset_id", CLType::String),
            Parameter::new("decision_id", CLType::String),
            Parameter::new("receipt", CLType::String),
        ],
        CLType::Unit,
        EntryPointAccess::Public,
        EntryPointType::Called,
        EntryPointPayment::Caller,
    ));
    entry_points.add_entry_point(EntryPoint::new(
        ENTRY_POINT_SET_LTV,
        vec![
            Parameter::new("asset_id", CLType::String),
            Parameter::new("decision_id", CLType::String),
            Parameter::new("receipt", CLType::String),
            Parameter::new("ltv_bps", CLType::U64),
        ],
        CLType::Unit,
        EntryPointAccess::Public,
        EntryPointType::Called,
        EntryPointPayment::Caller,
    ));
    entry_points.add_entry_point(EntryPoint::new(
        ENTRY_POINT_GET_POSITION,
        vec![Parameter::new("asset_id", CLType::String)],
        CLType::String,
        EntryPointAccess::Public,
        EntryPointType::Called,
        EntryPointPayment::Caller,
    ));
    entry_points.add_entry_point(EntryPoint::new(
        ENTRY_POINT_IS_FROZEN,
        vec![Parameter::new("asset_id", CLType::String)],
        CLType::Bool,
        EntryPointAccess::Public,
        EntryPointType::Called,
        EntryPointPayment::Caller,
    ));
    entry_points.add_entry_point(EntryPoint::new(
        ENTRY_POINT_GET_LTV,
        vec![Parameter::new("asset_id", CLType::String)],
        CLType::U64,
        EntryPointAccess::Public,
        EntryPointType::Called,
        EntryPointPayment::Caller,
    ));
    entry_points
}
