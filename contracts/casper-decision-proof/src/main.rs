#![no_std]
#![no_main]

#[cfg(not(target_arch = "wasm32"))]
compile_error!("target arch should be wasm32: compile with '--target wasm32v1-none'");

extern crate alloc;

mod install;
mod keys;

use alloc::{format, string::String};
use casper_contract::{
    contract_api::{runtime, storage},
    unwrap_or_revert::UnwrapOrRevert,
};
use casper_types::{
    api_error::ApiError,
    CLValue, URef,
};
use install::install_contract;
use keys::*;

#[no_mangle]
pub extern "C" fn record_decision() {
    let decision_id: String = runtime::get_named_arg("decision_id");
    let action: String = runtime::get_named_arg("action");
    let proof_digest: String = runtime::get_named_arg("proof_digest");
    let rationale_hash: String = runtime::get_named_arg("rationale_hash");
    let source_hash: String = runtime::get_named_arg("source_hash");
    let timestamp: String = runtime::get_named_arg("timestamp");
    let risk_score: u64 = runtime::get_named_arg("risk_score");
    let policy_gate: String = runtime::get_named_arg("policy_gate");
    let agent_account_hash: String = runtime::get_named_arg("agent_account_hash");
    let guardrail_hash: String = runtime::get_named_arg("guardrail_hash");
    if decision_id.is_empty() || proof_digest.is_empty() {
        runtime::revert(ApiError::InvalidArgument);
    }
    let receipt = format!(
        "{}|{}|{}|{}|{}|{}|{}|{}|{}|{}",
        decision_id,
        action,
        risk_score,
        proof_digest,
        rationale_hash,
        source_hash,
        timestamp,
        policy_gate,
        agent_account_hash,
        guardrail_hash
    );
    write_string(LATEST_DECISION_ID_KEY, decision_id.clone());
    write_string(LATEST_ACTION_KEY, action);
    write_string(LATEST_PROOF_DIGEST_KEY, proof_digest);
    write_string(LATEST_RATIONALE_HASH_KEY, rationale_hash);
    write_string(LATEST_SOURCE_HASH_KEY, source_hash);
    write_string(LATEST_TIMESTAMP_KEY, timestamp);
    write_u64(LATEST_RISK_SCORE_KEY, risk_score);
    write_string(LATEST_POLICY_GATE_KEY, policy_gate);
    write_string(LATEST_AGENT_ACCOUNT_HASH_KEY, agent_account_hash);
    write_string(LATEST_GUARDRAIL_HASH_KEY, guardrail_hash);
    write_string(LATEST_RECEIPT_KEY, receipt.clone());
    storage::named_dictionary_put(DECISION_RECEIPTS_KEY, &decision_id, receipt);
}

#[no_mangle]
pub extern "C" fn latest_proof_digest() {
    let digest = read_string(LATEST_PROOF_DIGEST_KEY);
    runtime::ret(CLValue::from_t(digest).unwrap_or_revert());
}

#[no_mangle]
pub extern "C" fn latest_decision_receipt() {
    let receipt = read_string(LATEST_RECEIPT_KEY);
    runtime::ret(CLValue::from_t(receipt).unwrap_or_revert());
}

#[no_mangle]
pub extern "C" fn get_decision_receipt() {
    let decision_id: String = runtime::get_named_arg("decision_id");
    let receipt_result: Option<String> = storage::named_dictionary_get(DECISION_RECEIPTS_KEY, &decision_id)
        .unwrap_or_revert_with(ApiError::Read);
    match receipt_result {
        Some(value) => runtime::ret(CLValue::from_t(value).unwrap_or_revert()),
        None => runtime::revert(ApiError::ValueNotFound),
    }
}

#[no_mangle]
pub extern "C" fn call() {
    install_contract();
}

fn write_string(key: &str, value: String) {
    let uref = named_uref(key);
    storage::write(uref, value);
}

fn write_u64(key: &str, value: u64) {
    let uref = named_uref(key);
    storage::write(uref, value);
}

fn read_string(key: &str) -> String {
    let uref = named_uref(key);
    storage::read(uref)
        .unwrap_or_revert_with(ApiError::Read)
        .unwrap_or_revert_with(ApiError::ValueNotFound)
}

fn named_uref(key: &str) -> URef {
    runtime::get_key(key)
        .unwrap_or_revert_with(ApiError::MissingKey)
        .into_uref()
        .unwrap_or_revert_with(ApiError::UnexpectedKeyVariant)
}
