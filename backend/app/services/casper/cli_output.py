import json
import re
from typing import Any


class CasperCliOutput:
    HASH_KEYS = ("transaction_hash", "transactionHash", "deploy_hash", "deployHash", "hash")
    HASH_PATTERN = re.compile(
        r"(?:transaction|deploy)[ _-]?hash[^0-9a-fA-F]*(?P<hash>[0-9a-fA-F]{32,})",
        re.IGNORECASE,
    )
    STATE_ROOT_PATTERN = re.compile(
        r"state[ _-]?root[ _-]?hash[^0-9a-fA-F]*(?P<hash>[0-9a-fA-F]{32,})",
        re.IGNORECASE,
    )
    HEX_HASH_PATTERN = re.compile(r"^[0-9a-fA-F]{32,}$")

    @staticmethod
    def extract_hash(output: str) -> str | None:
        parsed = CasperCliOutput.json_data(output)
        found = CasperCliOutput.find_hash(parsed)
        if found:
            return found
        match = CasperCliOutput.HASH_PATTERN.search(output)
        return match.group("hash") if match else None

    @staticmethod
    def extract_execution_status(output: str) -> str:
        parsed = CasperCliOutput.json_data(output)
        if isinstance(parsed, dict):
            error_message = CasperCliOutput.find_key(parsed, "error_message")
            if isinstance(error_message, str) and error_message:
                return "failed"
            if CasperCliOutput.find_key(parsed, "execution_result") is not None:
                return "confirmed"
        lowered = output.lower()
        if "failure" in lowered or "error_message" in lowered:
            return "failed"
        if "success" in lowered or "processed" in lowered:
            return "confirmed"
        return "pending_or_unverified"

    @staticmethod
    def extract_state_root_hash(output: str) -> str | None:
        parsed = CasperCliOutput.json_data(output)
        found = CasperCliOutput.find_key(parsed, "state_root_hash")
        if isinstance(found, str) and CasperCliOutput.HEX_HASH_PATTERN.match(found):
            return found
        match = CasperCliOutput.STATE_ROOT_PATTERN.search(output)
        return match.group("hash") if match else None

    @staticmethod
    def extract_cl_value(output: str) -> str | None:
        parsed = CasperCliOutput.json_data(output)
        found = CasperCliOutput.find_key(parsed, "parsed")
        if isinstance(found, str) and found:
            return found
        found = CasperCliOutput.find_key(parsed, "bytes")
        if isinstance(found, str) and found:
            return found
        return None

    @staticmethod
    def extract_balance_motes(output: str) -> int | None:
        parsed = CasperCliOutput.json_data(output)
        found = CasperCliOutput.find_key(parsed, "balance")
        if isinstance(found, str | int):
            try:
                return int(found)
            except (TypeError, ValueError):
                return None
        return None

    @staticmethod
    def json_data(output: str) -> Any:
        try:
            return json.loads(output)
        except json.JSONDecodeError:
            return None

    @staticmethod
    def find_hash(value: Any) -> str | None:
        if isinstance(value, dict):
            for key in CasperCliOutput.HASH_KEYS:
                item = value.get(key)
                if isinstance(item, str) and len(item) >= 32:
                    return item
            for item in value.values():
                found = CasperCliOutput.find_hash(item)
                if found:
                    return found
        if isinstance(value, list):
            for item in value:
                found = CasperCliOutput.find_hash(item)
                if found:
                    return found
        if isinstance(value, str) and CasperCliOutput.HEX_HASH_PATTERN.match(value):
            return value
        return None

    @staticmethod
    def find_key(value: Any, target_key: str) -> Any:
        if isinstance(value, dict):
            if target_key in value:
                return value[target_key]
            for item in value.values():
                found = CasperCliOutput.find_key(item, target_key)
                if found is not None:
                    return found
        if isinstance(value, list):
            for item in value:
                found = CasperCliOutput.find_key(item, target_key)
                if found is not None:
                    return found
        return None
