from typing import Any

import httpx

from app.core.settings import get_settings


class CsprCloudClient:
    @staticmethod
    def _headers() -> dict[str, str]:
        key = get_settings().casper_cspr_cloud_api_key
        return {"X-API-Key": key} if key else {}

    @staticmethod
    def get_block_height() -> int | None:
        settings = get_settings()
        if not settings.casper_cspr_cloud_api_key:
            return None
        try:
            with httpx.Client(
                timeout=settings.casper_rpc_timeout_sec,
                headers=CsprCloudClient._headers(),
            ) as client:
                resp = client.get(f"{settings.casper_cspr_cloud_url}/api/v1/blocks", params={"limit": 1})
                resp.raise_for_status()
                return CsprCloudClient.extract_block_height(resp.json())
        except Exception:
            return None

    @staticmethod
    def get_account_balance(public_key: str) -> dict[str, Any] | None:
        settings = get_settings()
        if not settings.casper_cspr_cloud_api_key or not public_key:
            return None
        try:
            with httpx.Client(
                timeout=settings.casper_rpc_timeout_sec,
                headers=CsprCloudClient._headers(),
            ) as client:
                resp = client.get(f"{settings.casper_cspr_cloud_url}/api/v1/accounts/{public_key}/balance")
                resp.raise_for_status()
                motes = CsprCloudClient.extract_motes(resp.json())
                if motes is None:
                    return None
                return {"motes": motes, "cspr": motes / 1_000_000_000}
        except Exception:
            return None

    @staticmethod
    def extract_block_height(data: Any) -> int | None:
        blocks = data.get("data", data) if isinstance(data, dict) else data
        if isinstance(blocks, dict):
            blocks = blocks.get("blocks", blocks.get("items", blocks))
        if isinstance(blocks, list) and blocks:
            block = blocks[0]
            if isinstance(block, dict):
                height = block.get("height", block.get("blockHeight", block.get("block_height")))
                return int(height) if height is not None else None
        return None

    @staticmethod
    def extract_motes(data: Any) -> int | None:
        if not isinstance(data, dict):
            return None
        payload = data.get("data", data)
        if isinstance(payload, dict):
            value = payload.get("balance", payload.get("motes", payload.get("total_balance")))
        else:
            value = payload
        return int(value) if value is not None else None
