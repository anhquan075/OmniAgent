from decimal import Decimal

import httpx

from app.core.settings import get_settings
from app.services.trading.token_registry import TOKEN_REGISTRY

BALANCE_OF_SELECTOR = "0x70a08231"

class CapitalReadinessService:
    @staticmethod
    async def get_capital_readiness(wallet_address: str | None) -> dict[str, object]:
        settings = get_settings()
        if not wallet_address or not wallet_address.startswith("0x") or len(wallet_address) != 42:
            return {"ready": False, "status": "wallet_missing", "reason": "Agent wallet address is not configured."}
        symbols = [symbol for symbol in ("BNB", "USDT", "USDC", "CAKE", "TWT") if symbol in settings.token_allowlist]
        balances: list[dict[str, object]] = []
        try:
            for symbol in symbols:
                token = TOKEN_REGISTRY[symbol]
                raw = await CapitalReadinessService.native_balance(wallet_address) if token.native else await CapitalReadinessService.erc20_balance(token.address, wallet_address)
                amount = CapitalReadinessService.units_to_decimal(raw, token.decimals)
                spendable_raw = max(raw - settings.bnb_min_gas_reserve_wei, 0) if token.native else raw
                balances.append({
                    "symbol": symbol,
                    "raw": str(raw),
                    "amount": CapitalReadinessService.format_amount(amount),
                    "spendableRaw": str(spendable_raw),
                    "spendableAmount": CapitalReadinessService.format_amount(CapitalReadinessService.units_to_decimal(spendable_raw, token.decimals)),
                    "eligibleForCompetition": token.eligible_for_competition,
                    "hasBalance": raw > 0,
                    "gasReserveWei": settings.bnb_min_gas_reserve_wei if token.native else None,
                })
        except (httpx.HTTPError, ValueError) as error:
            return {
                "ready": False,
                "status": "rpc_unavailable",
                "reason": f"BSC balance check failed: {error}",
                "walletAddress": wallet_address,
            }
        gas_ready = any(
            item["symbol"] == "BNB"
            and int(str(item["raw"])) >= settings.bnb_min_gas_reserve_wei
            for item in balances
        )
        trade_asset_ready = any(int(str(item["spendableRaw"])) > 0 for item in balances)
        return {
            "ready": gas_ready and trade_asset_ready,
            "status": "ready" if gas_ready and trade_asset_ready else "needs_capital",
            "walletAddress": wallet_address,
            "gasReady": gas_ready,
            "tradeAssetReady": trade_asset_ready,
            "balances": balances,
        }

    @staticmethod
    async def native_balance(wallet_address: str) -> int:
        result = await CapitalReadinessService.rpc_call("eth_getBalance", [wallet_address, "latest"])
        return int(str(result or "0x0"), 16)

    @staticmethod
    async def erc20_balance(token_address: str, wallet_address: str) -> int:
        data = BALANCE_OF_SELECTOR + wallet_address.lower().removeprefix("0x").rjust(64, "0")
        result = await CapitalReadinessService.rpc_call("eth_call", [{"to": token_address, "data": data}, "latest"])
        return int(str(result or "0x0"), 16)

    @staticmethod
    async def rpc_call(method: str, params: list[object]) -> object:
        settings = get_settings()
        async with httpx.AsyncClient(timeout=8, verify=settings.bnb_rpc_tls_verify) as client:
            response = await client.post(
                settings.bnb_rpc_url,
                json={"jsonrpc": "2.0", "id": method, "method": method, "params": params},
            )
            response.raise_for_status()
            payload = response.json()
        if payload.get("error"):
            raise ValueError(str(payload["error"].get("message") or payload["error"]))
        return payload.get("result")

    @staticmethod
    def units_to_decimal(raw: int, decimals: int) -> Decimal:
        return Decimal(raw) / (Decimal(10) ** decimals)

    @staticmethod
    def format_amount(value: Decimal) -> str:
        normalized = value.quantize(Decimal("0.00000001")) if value else Decimal("0")
        return str(normalized.normalize())
