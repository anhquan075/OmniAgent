import json
from pathlib import Path
from typing import Any

import httpx
from loguru import logger

class TrustWalletRestClient:
    @staticmethod
    def bearer_headers(api_key: str | None, hmac_secret: str | None) -> dict[str, str]:
        token = api_key or hmac_secret or TrustWalletRestClient.local_hmac_secret()
        return {"Authorization": f"Bearer {token}"} if token else {}

    @staticmethod
    async def list_rest_actions(
        base_url: str,
        api_key: str | None,
        hmac_secret: str | None,
        timeout: float,
    ) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(
                f"{base_url.rstrip('/')}/actions",
                headers=TrustWalletRestClient.bearer_headers(api_key, hmac_secret),
            )
            response.raise_for_status()
            payload = response.json()
        actions = payload.get("actions") if isinstance(payload.get("actions"), list) else []
        logger.info("twak rest actions baseUrl={} count={}", base_url, len(actions))
        return payload

    @staticmethod
    async def call_rest_action(
        base_url: str,
        api_key: str | None,
        hmac_secret: str | None,
        action: str,
        arguments: dict[str, Any] | None = None,
        timeout: float = 30,
    ) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                f"{base_url.rstrip('/')}/actions/{action}",
                json=arguments or {},
                headers=TrustWalletRestClient.bearer_headers(api_key, hmac_secret),
            )
            response.raise_for_status()
            payload = response.json()
        result = TrustWalletRestClient.unwrap_action_payload(payload)
        logger.info(
            "twak rest action={} success={} tx={}",
            action,
            result.get("success"),
            result.get("txHash") or result.get("hash"),
        )
        return result

    @staticmethod
    def unwrap_action_payload(payload: dict[str, Any]) -> dict[str, Any]:
        content = payload.get("content")
        if isinstance(content, list):
            for item in content:
                if isinstance(item, dict) and item.get("type") == "text":
                    text = item.get("text")
                    if isinstance(text, str):
                        try:
                            value = json.loads(text)
                        except json.JSONDecodeError:
                            continue
                        if isinstance(value, dict):
                            return value
        return payload

    @staticmethod
    def local_hmac_secret() -> str | None:
        path = Path.home() / ".twak" / "credentials.json"
        try:
            payload = json.loads(path.read_text())
        except (OSError, json.JSONDecodeError):
            return None
        secret = payload.get("hmacSecret")
        return secret if isinstance(secret, str) and secret else None
