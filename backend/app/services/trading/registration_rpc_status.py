import httpx

from app.core.settings import get_settings
from app.services.trading.registration import ADDRESS_RE

REGISTRATION_EVENT_TOPIC = "0x2d3734a8e47ac8316e500ac231c90a6e1848ca2285f40d07eaa52005e4b3a0e9"
REGISTRATION_SCAN_FROM_BLOCK = 102_000_000


class CompetitionRegistrationRpcStatusService:
    @staticmethod
    async def get_rpc_competition_status(wallet_address: str) -> dict[str, object] | None:
        if not ADDRESS_RE.match(wallet_address):
            return None
        settings = get_settings()
        try:
            logs = await CompetitionRegistrationRpcStatusService.rpc_call("eth_getLogs", [{
                "address": settings.bnb_competition_contract_address,
                "fromBlock": hex(REGISTRATION_SCAN_FROM_BLOCK),
                "toBlock": "latest",
                "topics": [
                    REGISTRATION_EVENT_TOPIC,
                    CompetitionRegistrationRpcStatusService.address_topic(wallet_address),
                ],
            }])
        except (httpx.HTTPError, ValueError, TypeError) as error:
            return {
                "source": "bsc-rpc",
                "ready": False,
                "registered": False,
                "reason": str(error),
            }
        if not isinstance(logs, list) or not logs:
            return {
                "source": "bsc-rpc",
                "ready": True,
                "registered": False,
                "reason": "No competition registration event found for wallet.",
            }
        latest = next((item for item in reversed(logs) if isinstance(item, dict)), {})
        return {
            "source": "bsc-rpc",
            "ready": True,
            "registered": True,
            "participant": wallet_address,
            "competitionContractAddress": settings.bnb_competition_contract_address,
            "chainId": settings.bnb_chain_id,
            "txHash": latest.get("transactionHash"),
            "blockNumber": CompetitionRegistrationRpcStatusService.hex_int(latest.get("blockNumber")),
            "eventTopic": REGISTRATION_EVENT_TOPIC,
        }

    @staticmethod
    def address_topic(wallet_address: str) -> str:
        return "0x" + wallet_address.lower().removeprefix("0x").rjust(64, "0")

    @staticmethod
    def hex_int(value: object) -> int | None:
        try:
            return int(str(value or "0x0"), 16)
        except ValueError:
            return None

    @staticmethod
    async def rpc_call(method: str, params: list[object]) -> object:
        settings = get_settings()
        async with httpx.AsyncClient(timeout=12, verify=settings.bnb_rpc_tls_verify) as client:
            response = await client.post(
                settings.bnb_rpc_url,
                json={"jsonrpc": "2.0", "id": method, "method": method, "params": params},
            )
            response.raise_for_status()
            payload = response.json()
        if payload.get("error"):
            raise ValueError(str(payload["error"].get("message") or payload["error"]))
        return payload.get("result")
