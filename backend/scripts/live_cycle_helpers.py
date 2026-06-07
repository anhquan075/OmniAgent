from __future__ import annotations

from typing import Any


REAL_TRADE_FLAG = "--i-understand-this-trades-real-bsc-mainnet"


def submission_signal(result: dict[str, Any], status: dict[str, Any]) -> dict[str, Any]:
    for source in (status, result):
        signal = source.get("cmcAgentHubSignal") if isinstance(source.get("cmcAgentHubSignal"), dict) else None
        if signal:
            return signal
        proof = source.get("submissionProof") if isinstance(source.get("submissionProof"), dict) else None
        if proof and isinstance(proof.get("cmcAgentHubSignal"), dict):
            return proof["cmcAgentHubSignal"]
    return {}


def tx_hash_from(result: dict[str, Any]) -> str | None:
    for key in ("txHash", "transactionHash"):
        value = result.get(key)
        if isinstance(value, str) and value.startswith("0x"):
            return value
    execution = result.get("execution") if isinstance(result.get("execution"), dict) else {}
    value = execution.get("txHash") or execution.get("transactionHash")
    return str(value) if isinstance(value, str) and value.startswith("0x") else None
