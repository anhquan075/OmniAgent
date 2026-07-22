#![no_std]
#![no_main]

#[cfg(not(target_arch = "wasm32"))]
compile_error!("target arch should be wasm32: compile with '--target wasm32v1-none'");

extern crate alloc;

mod install;
mod keys;

use alloc::{format, string::{String, ToString}, vec::Vec};
use casper_contract::{
    contract_api::{runtime, storage},
    unwrap_or_revert::UnwrapOrRevert,
};
use casper_types::{api_error::ApiError, CLValue, URef};
use install::install_contract;
use keys::*;

/// Position encoding: deposited|frozen(0/1)|ltv_bps|last_decision_id
fn encode_position(deposited: u64, frozen: bool, ltv_bps: u64, last_decision_id: &str) -> String {
    format!(
        "{}|{}|{}|{}",
        deposited,
        if frozen { 1 } else { 0 },
        ltv_bps,
        last_decision_id
    )
}

fn decode_position(raw: &str) -> (u64, bool, u64, String) {
    let parts: Vec<&str> = raw.split('|').collect();
    if parts.len() < 4 {
        return (0, false, 7500, String::new());
    }
    let deposited = parts[0].parse::<u64>().unwrap_or(0);
    let frozen = parts[1] == "1";
    let ltv_bps = parts[2].parse::<u64>().unwrap_or(7500);
    let last = parts[3].to_string();
    (deposited, frozen, ltv_bps, last)
}

fn read_position(asset_id: &str) -> (u64, bool, u64, String) {
    let existing: Option<String> =
        storage::named_dictionary_get(POSITIONS_KEY, asset_id).unwrap_or_revert_with(ApiError::Read);
    match existing {
        Some(raw) => decode_position(&raw),
        None => (0, false, 7500, String::new()),
    }
}

fn write_position(asset_id: &str, deposited: u64, frozen: bool, ltv_bps: u64, last_decision_id: &str) {
    let encoded = encode_position(deposited, frozen, ltv_bps, last_decision_id);
    storage::named_dictionary_put(POSITIONS_KEY, asset_id, encoded);
}

/// Receipt format from decision-proof:
/// decision_id|action|risk_score|proof_digest|rationale|source|timestamp|policy_gate|agent|guardrail
fn parse_receipt(receipt: &str) -> Result<(String, String, String), u16> {
    let parts: Vec<&str> = receipt.split('|').collect();
    if parts.len() < 10 {
        return Err(1);
    }
    Ok((
        parts[0].to_string(),
        parts[1].to_string(),
        parts[7].to_string(),
    ))
}

fn require_approved_receipt(decision_id: &str, expected_action: &str, receipt: &str) {
    let (rid, action, policy_gate) = match parse_receipt(receipt) {
        Ok(v) => v,
        Err(_) => runtime::revert(ApiError::User(100)),
    };
    if rid != decision_id {
        runtime::revert(ApiError::User(101));
    }
    if policy_gate != "approved" {
        runtime::revert(ApiError::User(102));
    }
    if action != expected_action {
        runtime::revert(ApiError::User(103));
    }
}

fn write_string(key: &str, value: String) {
    let uref = named_uref(key);
    storage::write(uref, value);
}

fn named_uref(key: &str) -> URef {
    runtime::get_key(key)
        .unwrap_or_revert_with(ApiError::MissingKey)
        .into_uref()
        .unwrap_or_revert_with(ApiError::UnexpectedKeyVariant)
}

fn record_enforcement(decision_id: &str, action: &str, receipt: &str) {
    write_string(LAST_DECISION_ID_KEY, decision_id.to_string());
    write_string(LAST_ACTION_KEY, action.to_string());
    write_string(LAST_RECEIPT_KEY, receipt.to_string());
}

#[no_mangle]
pub extern "C" fn deposit() {
    let asset_id: String = runtime::get_named_arg("asset_id");
    let amount: u64 = runtime::get_named_arg("amount");
    if asset_id.is_empty() || amount == 0 {
        runtime::revert(ApiError::InvalidArgument);
    }
    let (deposited, frozen, ltv_bps, last) = read_position(&asset_id);
    if frozen {
        runtime::revert(ApiError::User(110));
    }
    write_position(
        &asset_id,
        deposited.saturating_add(amount),
        frozen,
        ltv_bps,
        &last,
    );
}

#[no_mangle]
pub extern "C" fn freeze() {
    let asset_id: String = runtime::get_named_arg("asset_id");
    let decision_id: String = runtime::get_named_arg("decision_id");
    let receipt: String = runtime::get_named_arg("receipt");
    // Map: policy action `block` → vault freeze
    require_approved_receipt(&decision_id, "block", &receipt);
    let (deposited, _frozen, ltv_bps, _) = read_position(&asset_id);
    if deposited == 0 {
        runtime::revert(ApiError::User(111));
    }
    write_position(&asset_id, deposited, true, ltv_bps, &decision_id);
    record_enforcement(&decision_id, "block", &receipt);
}

#[no_mangle]
pub extern "C" fn unfreeze() {
    let asset_id: String = runtime::get_named_arg("asset_id");
    let decision_id: String = runtime::get_named_arg("decision_id");
    let receipt: String = runtime::get_named_arg("receipt");
    // Map: policy action `approve` → vault unfreeze
    require_approved_receipt(&decision_id, "approve", &receipt);
    let (deposited, _frozen, ltv_bps, _) = read_position(&asset_id);
    write_position(&asset_id, deposited, false, ltv_bps, &decision_id);
    record_enforcement(&decision_id, "approve", &receipt);
}

#[no_mangle]
pub extern "C" fn set_ltv() {
    let asset_id: String = runtime::get_named_arg("asset_id");
    let decision_id: String = runtime::get_named_arg("decision_id");
    let receipt: String = runtime::get_named_arg("receipt");
    let ltv_bps: u64 = runtime::get_named_arg("ltv_bps");
    if ltv_bps > 10_000 {
        runtime::revert(ApiError::InvalidArgument);
    }
    // Map: policy action `haircut` → vault set_ltv
    require_approved_receipt(&decision_id, "haircut", &receipt);
    let (deposited, frozen, _, _) = read_position(&asset_id);
    write_position(&asset_id, deposited, frozen, ltv_bps, &decision_id);
    record_enforcement(&decision_id, "haircut", &receipt);
}

#[no_mangle]
pub extern "C" fn get_position() {
    let asset_id: String = runtime::get_named_arg("asset_id");
    let (deposited, frozen, ltv_bps, last) = read_position(&asset_id);
    let encoded = encode_position(deposited, frozen, ltv_bps, &last);
    runtime::ret(CLValue::from_t(encoded).unwrap_or_revert());
}

#[no_mangle]
pub extern "C" fn is_frozen() {
    let asset_id: String = runtime::get_named_arg("asset_id");
    let (_d, frozen, _l, _last) = read_position(&asset_id);
    runtime::ret(CLValue::from_t(frozen).unwrap_or_revert());
}

#[no_mangle]
pub extern "C" fn get_ltv() {
    let asset_id: String = runtime::get_named_arg("asset_id");
    let (_d, _f, ltv_bps, _last) = read_position(&asset_id);
    runtime::ret(CLValue::from_t(ltv_bps).unwrap_or_revert());
}

#[no_mangle]
pub extern "C" fn call() {
    install_contract();
}
