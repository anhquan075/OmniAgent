from typing import Any

import httpx

from app.core.settings import get_settings


class CasperJsonRpcClient:
    @staticmethod
    def payload(method: str, params: list[Any] | dict[str, Any] | None = None) -> dict[str, Any]:
        return {"id": 1, "jsonrpc": "2.0", "method": method, "params": params or []}

    @staticmethod
    async def call(method: str, params: list[Any] | dict[str, Any] | None = None) -> dict[str, Any]:
        settings = get_settings()
        async with httpx.AsyncClient(timeout=settings.casper_rpc_timeout_sec) as client:
            response = await client.post(settings.casper_rpc_url, json=CasperJsonRpcClient.payload(method, params))
            response.raise_for_status()
            data = response.json()
        return data if isinstance(data, dict) else {"error": "invalid_casper_rpc_response"}

    @staticmethod
    def sync_call(method: str, params: list[Any] | dict[str, Any] | None = None) -> dict[str, Any]:
        settings = get_settings()
        with httpx.Client(timeout=settings.casper_rpc_timeout_sec) as client:
            response = client.post(settings.casper_rpc_url, json=CasperJsonRpcClient.payload(method, params))
            response.raise_for_status()
            data = response.json()
        return data if isinstance(data, dict) else {"error": "invalid_casper_rpc_response"}

    @staticmethod
    def get_state_root_hash_sync() -> str | None:
        try:
            result = CasperJsonRpcClient.sync_call("chain_get_state_root_hash")
            return result.get("result", {}).get("state_root_hash")
        except Exception:
            return None

    @staticmethod
    def query_global_state_sync(state_root_hash: str, key: str, path: str = "") -> dict[str, Any] | None:
        try:
            params = {"state_root_hash": state_root_hash, "key": key, "path": [path] if path else []}
            result = CasperJsonRpcClient.sync_call("query_global_state", params)
            return result.get("result", {})
        except Exception:
            return None

    @staticmethod
    def get_dictionary_item_sync(
        state_root_hash: str,
        contract_hash: str,
        dictionary_name: str,
        item_key: str,
    ) -> dict[str, Any] | None:
        try:
            params = {
                "state_root_hash": state_root_hash,
                "dictionary_identifier": {
                    "ContractNamedKey": {
                        "key": CasperJsonRpcClient.query_key(contract_hash),
                        "dictionary_name": dictionary_name,
                        "dictionary_item_key": item_key,
                    }
                },
            }
            result = CasperJsonRpcClient.sync_call("state_get_dictionary_item", params)
            return result.get("result", {})
        except Exception:
            return None

    @staticmethod
    def query_latest_proof_digest_sync() -> dict[str, Any]:
        contract_hash = get_settings().casper_decision_contract_hash
        state_root_hash = CasperJsonRpcClient.get_state_root_hash_sync()
        if not contract_hash:
            return CasperJsonRpcClient.blocked("casper_decision_contract_hash_missing")
        if not state_root_hash:
            return CasperJsonRpcClient.blocked("casper_state_root_hash_missing")
        result = CasperJsonRpcClient.query_global_state_sync(
            state_root_hash,
            CasperJsonRpcClient.query_key(contract_hash),
            "latest_proof_digest",
        )
        proof_digest = CasperJsonRpcClient.extract_cl_value(result)
        if not proof_digest:
            return {
                **CasperJsonRpcClient.blocked("casper_readback_missing"),
                "stateRootHash": state_root_hash,
                "proofDigest": None,
            }
        return {
            "status": "ready",
            "source": "casper_json_rpc_query_global_state",
            "stateRootHash": state_root_hash,
            "proofDigest": proof_digest,
            "hardBlockers": [],
        }

    @staticmethod
    def query_decision_receipt_sync(decision_id: str) -> dict[str, Any]:
        contract_hash = get_settings().casper_decision_contract_hash
        state_root_hash = CasperJsonRpcClient.get_state_root_hash_sync()
        if not contract_hash:
            return CasperJsonRpcClient.blocked("casper_decision_contract_hash_missing")
        if not state_root_hash:
            return CasperJsonRpcClient.blocked("casper_state_root_hash_missing")
        result = CasperJsonRpcClient.get_dictionary_item_sync(
            state_root_hash,
            contract_hash,
            "decision_receipts",
            decision_id.replace("'", "").strip(),
        )
        receipt = CasperJsonRpcClient.extract_cl_value(result)
        if not receipt:
            return {
                **CasperJsonRpcClient.blocked("casper_decision_receipt_readback_missing"),
                "stateRootHash": state_root_hash,
                "decisionReceipt": None,
            }
        return {
            "status": "ready",
            "source": "casper_json_rpc_dictionary_item",
            "stateRootHash": state_root_hash,
            "decisionReceipt": receipt,
            "hardBlockers": [],
        }

    @staticmethod
    def extract_cl_value(value: Any) -> str | None:
        if isinstance(value, dict):
            for key in ("parsed", "bytes"):
                item = value.get(key)
                if isinstance(item, str) and item:
                    return item
            for item in value.values():
                found = CasperJsonRpcClient.extract_cl_value(item)
                if found:
                    return found
        if isinstance(value, list):
            for item in value:
                found = CasperJsonRpcClient.extract_cl_value(item)
                if found:
                    return found
        return None

    @staticmethod
    def blocked(blocker: str) -> dict[str, Any]:
        return {
            "status": "blocked",
            "source": "casper_json_rpc",
            "hardBlockers": [blocker],
        }

    @staticmethod
    def query_key(value: str) -> str:
        if value.startswith(("hash-", "account-hash-", "uref-")):
            return value
        return f"hash-{value}"
