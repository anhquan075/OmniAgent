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
use casper_types::{api_error::ApiError, CLValue, URef};
use install::{install_contract, normalize_account_hash};
use keys::*;

#[no_mangle]
pub extern "C" fn record_decision() {
    require_authorized_agent();
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
    if !is_known_policy_gate(&policy_gate) {
        runtime::revert(ApiError::InvalidArgument);
    }
    // Receipt agent field must name the deploy signer, not an arbitrary claim.
    let caller_hex = caller_account_hex();
    let claimed = normalize_account_hash(&agent_account_hash);
    if claimed.is_empty() || claimed != caller_hex {
        runtime::revert(ApiError::User(131));
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
        claimed,
        guardrail_hash
    );
    let approved = policy_gate.as_str() == "approved";
    if approved {
        write_string(LATEST_DECISION_ID_KEY, decision_id.clone());
        write_string(LATEST_ACTION_KEY, action);
        write_string(LATEST_PROOF_DIGEST_KEY, proof_digest);
        write_string(LATEST_RATIONALE_HASH_KEY, rationale_hash);
        write_string(LATEST_SOURCE_HASH_KEY, source_hash);
        write_string(LATEST_TIMESTAMP_KEY, timestamp);
        write_u64(LATEST_RISK_SCORE_KEY, risk_score);
        write_string(LATEST_POLICY_GATE_KEY, policy_gate.clone());
        write_string(LATEST_AGENT_ACCOUNT_HASH_KEY, claimed);
        write_string(LATEST_GUARDRAIL_HASH_KEY, guardrail_hash);
        write_string(LATEST_RECEIPT_KEY, receipt.clone());
    } else {
        // Fail-closed path: seal the reject on-chain without clobbering the
        // approved live_verified latest_* surface desks/judges replay.
        write_string(LATEST_BLOCKED_DECISION_ID_KEY, decision_id.clone());
        write_string(LATEST_BLOCKED_POLICY_GATE_KEY, policy_gate.clone());
        write_string(LATEST_BLOCKED_RECEIPT_KEY, receipt.clone());
    }
    let proposer = runtime::try_get_named_arg::<String>("proposer_verdict").unwrap_or_default();
    let critic = runtime::try_get_named_arg::<String>("critic_verdict").unwrap_or_default();
    let dissent = runtime::try_get_named_arg::<String>("dissent_digest").unwrap_or_default();
    if !proposer.is_empty() {
        write_string(LATEST_PROPOSER_VERDICT_KEY, proposer);
    }
    if !critic.is_empty() {
        write_string(LATEST_CRITIC_VERDICT_KEY, critic);
    }
    if !dissent.is_empty() {
        write_string(LATEST_DISSENT_DIGEST_KEY, dissent);
    }
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
    let receipt_result: Option<String> =
        storage::named_dictionary_get(DECISION_RECEIPTS_KEY, &decision_id)
            .unwrap_or_revert_with(ApiError::Read);
    match receipt_result {
        Some(value) => runtime::ret(CLValue::from_t(value).unwrap_or_revert()),
        None => runtime::revert(ApiError::ValueNotFound),
    }
}

#[no_mangle]
pub extern "C" fn get_authorized_agent() {
    let agent = read_string(AUTHORIZED_AGENT_KEY);
    runtime::ret(CLValue::from_t(agent).unwrap_or_revert());
}

#[no_mangle]
pub extern "C" fn latest_blocked_receipt() {
    let receipt = read_string_or_empty(LATEST_BLOCKED_RECEIPT_KEY);
    runtime::ret(CLValue::from_t(receipt).unwrap_or_revert());
}

/// One-shot ACL correction used by the upgrade session.
///
/// Requires `acl_rotation_enabled=true` (seeded in the same deploy), writes the
/// new authorized agent, then clears the flag so later public calls revert.
#[no_mangle]
pub extern "C" fn rotate_authorized_agent() {
    if !read_bool(ACL_ROTATION_ENABLED_KEY) {
        runtime::revert(ApiError::User(132));
    }
    let agent_account_hash: String = runtime::get_named_arg("agent_account_hash");
    let authorized = normalize_account_hash(&agent_account_hash);
    if authorized.is_empty() {
        runtime::revert(ApiError::InvalidArgument);
    }
    write_string(AUTHORIZED_AGENT_KEY, authorized);
    write_bool(ACL_ROTATION_ENABLED_KEY, false);
}

#[no_mangle]
pub extern "C" fn call() {
    install_contract();
}

fn is_known_policy_gate(gate: &str) -> bool {
    matches!(gate, "approved" | "blocked" | "hold" | "warn")
}

fn read_string_or_empty(key: &str) -> String {
    match runtime::get_key(key) {
        Some(k) => {
            let uref = k
                .into_uref()
                .unwrap_or_revert_with(ApiError::UnexpectedKeyVariant);
            storage::read(uref)
                .unwrap_or_revert_with(ApiError::Read)
                .unwrap_or_default()
        }
        None => String::new(),
    }
}

/// Only the install-time agent account may write receipts.
///
/// User(130): deploy signer is not the stored `authorized_agent`.
fn require_authorized_agent() {
    let authorized = normalize_account_hash(&read_string(AUTHORIZED_AGENT_KEY));
    let caller = caller_account_hex();
    if authorized.is_empty() || authorized != caller {
        runtime::revert(ApiError::User(130));
    }
}

fn caller_account_hex() -> String {
    let caller = runtime::get_caller();
    let bytes = caller.as_bytes();
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        const HEX: &[u8; 16] = b"0123456789abcdef";
        out.push(HEX[(byte >> 4) as usize] as char);
        out.push(HEX[(byte & 0xf) as usize] as char);
    }
    out
}

fn write_string(key: &str, value: String) {
    let uref = named_uref(key);
    storage::write(uref, value);
}

fn write_u64(key: &str, value: u64) {
    let uref = named_uref(key);
    storage::write(uref, value);
}

fn write_bool(key: &str, value: bool) {
    let uref = named_uref(key);
    storage::write(uref, value);
}

fn read_string(key: &str) -> String {
    let uref = named_uref(key);
    storage::read(uref)
        .unwrap_or_revert_with(ApiError::Read)
        .unwrap_or_revert_with(ApiError::ValueNotFound)
}

fn read_bool(key: &str) -> bool {
    let uref = match runtime::get_key(key) {
        Some(key) => key
            .into_uref()
            .unwrap_or_revert_with(ApiError::UnexpectedKeyVariant),
        None => return false,
    };
    storage::read(uref)
        .unwrap_or_revert_with(ApiError::Read)
        .unwrap_or(false)
}

fn named_uref(key: &str) -> URef {
    runtime::get_key(key)
        .unwrap_or_revert_with(ApiError::MissingKey)
        .into_uref()
        .unwrap_or_revert_with(ApiError::UnexpectedKeyVariant)
}
