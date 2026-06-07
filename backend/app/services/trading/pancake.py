import time
from decimal import Decimal, ROUND_DOWN

import httpx
from eth_abi import decode, encode
from eth_utils import function_signature_to_4byte_selector

from app.core.settings import get_settings
from app.services.trading.token_registry import BNB_NATIVE_TOKEN_ADDRESS, WBNB_ADDRESS
from app.services.trading.token_registry import TokenRegistryService
from app.services.wallet.agent_wallet import AgentWalletService

class PancakeRouterService:
    @staticmethod
    def build_preview_quote(args: dict[str, object]) -> dict[str, object]:
        normalized = PancakeRouterService.normalize_request(args)
        min_output_raw = PancakeRouterService.apply_slippage("0", normalized["slippageBps"])
        deadline = int(time.time()) + int(normalized["deadlineSeconds"])
        calldata = PancakeRouterService.encode_swap(normalized, min_output_raw, deadline)
        settings = get_settings()
        return {
            "network": "bsc",
            "routerAddress": settings.bnb_pancake_swap_router_address,
            "symbol": normalized["symbol"],
            "side": normalized["side"],
            "amountUsd": normalized["amountUsd"],
            "amountInRaw": normalized["amountInRaw"],
            "expectedOutputRaw": "0",
            "minOutputRaw": min_output_raw,
            "inputSymbol": normalized["inputSymbol"],
            "outputSymbol": normalized["outputSymbol"],
            "inputTokenAddress": normalized["inputTokenAddress"],
            "outputTokenAddress": normalized["outputTokenAddress"],
            "path": normalized["path"],
            "recipient": normalized["recipient"],
            "deadline": deadline,
            "slippageBps": normalized["slippageBps"],
            "calldata": calldata,
            "quoteSource": "preview",
            "transaction": PancakeRouterService.build_transaction(calldata, normalized),
        }

    @staticmethod
    async def build_router_quote(args: dict[str, object]) -> dict[str, object]:
        normalized = PancakeRouterService.normalize_request(args)
        amounts_out = await PancakeRouterService.get_amounts_out(str(normalized["amountInRaw"]), normalized["path"])
        expected_output_raw = str(amounts_out[-1])
        min_output_raw = PancakeRouterService.apply_slippage(expected_output_raw, normalized["slippageBps"])
        deadline = int(time.time()) + int(normalized["deadlineSeconds"])
        calldata = PancakeRouterService.encode_swap(normalized, min_output_raw, deadline)
        settings = get_settings()
        return {
            "network": "bsc",
            "routerAddress": settings.bnb_pancake_swap_router_address,
            "symbol": normalized["symbol"],
            "side": normalized["side"],
            "amountUsd": normalized["amountUsd"],
            "amountInRaw": normalized["amountInRaw"],
            "expectedOutputRaw": expected_output_raw,
            "minOutputRaw": min_output_raw,
            "inputSymbol": normalized["inputSymbol"],
            "outputSymbol": normalized["outputSymbol"],
            "inputTokenAddress": normalized["inputTokenAddress"],
            "outputTokenAddress": normalized["outputTokenAddress"],
            "path": normalized["path"],
            "recipient": normalized["recipient"],
            "deadline": deadline,
            "slippageBps": normalized["slippageBps"],
            "calldata": calldata,
            "quoteSource": "router",
            "transaction": PancakeRouterService.build_transaction(calldata, normalized),
        }

    @staticmethod
    def normalize_request(args: dict[str, object]) -> dict[str, object]:
        symbol = str(args.get("symbol") or "CAKE").upper()
        token = TokenRegistryService.get_token(symbol)
        if not token or not TokenRegistryService.is_token_allowed(symbol):
            raise ValueError(f"Token {symbol} is not in the BSC allowlist.")
        if symbol == "USDT":
            raise ValueError("USDT is the quote asset and cannot be the target trade symbol.")
        side = str(args.get("side") or "buy").lower()
        if side not in {"buy", "sell"}:
            raise ValueError("side must be buy or sell.")
        wallet = AgentWalletService.get_wallet_data()
        recipient = str(args.get("recipient") or wallet.get("walletAddress") or "")
        if not recipient.startswith("0x") or len(recipient) != 42:
            raise ValueError("A valid BSC recipient wallet is required.")
        amount_usd = Decimal(str(args.get("amountUsd") or "25"))
        if amount_usd <= 0:
            raise ValueError("amountUsd must be positive.")
        slippage_bps = int(args.get("slippageBps") or 50)
        if slippage_bps < 0 or slippage_bps > 500:
            raise ValueError("slippageBps must be an integer between 0 and 500.")
        usdt = TokenRegistryService.get_token("USDT")
        if not usdt:
            raise ValueError("USDT quote asset is not configured.")
        token_address = WBNB_ADDRESS if token.native else token.address
        token_input = side == "sell"
        if token_input and args.get("priceUsd") is None:
            raise ValueError("priceUsd is required for sell-side quotes.")
        price_usd = Decimal(str(args.get("priceUsd") or "1"))
        amount_in = PancakeRouterService.token_amount_from_usd(amount_usd, price_usd) if token_input else amount_usd
        decimals = token.decimals if token_input else usdt.decimals
        return {
            "symbol": symbol,
            "side": side,
            "amountUsd": float(amount_usd),
            "recipient": recipient,
            "slippageBps": slippage_bps,
            "deadlineSeconds": int(args.get("deadlineSeconds") or 600),
            "amountInRaw": PancakeRouterService.decimal_to_units(amount_in, decimals),
            "inputSymbol": symbol if token_input else "USDT",
            "outputSymbol": "USDT" if token_input else symbol,
            "inputTokenAddress": token.address if token_input else usdt.address,
            "outputTokenAddress": usdt.address if token_input else token.address,
            "path": [token_address, usdt.address] if token_input else [usdt.address, token_address],
        }

    @staticmethod
    def build_transaction(calldata: str, normalized: dict[str, object]) -> dict[str, object]:
        settings = get_settings()
        return {
            "chainId": settings.bnb_chain_id,
            "to": settings.bnb_pancake_swap_router_address,
            "from": normalized["recipient"],
            "data": calldata,
            "value": normalized["amountInRaw"] if normalized["inputTokenAddress"] == BNB_NATIVE_TOKEN_ADDRESS else "0",
        }

    @staticmethod
    def encode_swap(input_data: dict[str, object], min_output_raw: str, deadline: int) -> str:
        amount_in = int(str(input_data["amountInRaw"]))
        min_out = int(min_output_raw)
        path = input_data["path"]
        recipient = str(input_data["recipient"])
        if input_data["inputTokenAddress"] == BNB_NATIVE_TOKEN_ADDRESS:
            return PancakeRouterService.encode_call("swapExactETHForTokens(uint256,address[],address,uint256)", [min_out, path, recipient, deadline])
        if input_data["outputTokenAddress"] == BNB_NATIVE_TOKEN_ADDRESS:
            return PancakeRouterService.encode_call("swapExactTokensForETH(uint256,uint256,address[],address,uint256)", [amount_in, min_out, path, recipient, deadline])
        return PancakeRouterService.encode_call("swapExactTokensForTokens(uint256,uint256,address[],address,uint256)", [amount_in, min_out, path, recipient, deadline])

    @staticmethod
    def encode_call(signature: str, values: list[object]) -> str:
        types = signature[signature.index("(") + 1:-1].split(",")
        selector = function_signature_to_4byte_selector(signature)
        return "0x" + (selector + encode(types, values)).hex()

    @staticmethod
    async def get_amounts_out(amount_in_raw: str, path: list[str]) -> list[int]:
        settings = get_settings()
        data = PancakeRouterService.encode_call("getAmountsOut(uint256,address[])", [int(amount_in_raw), path])
        try:
            async with httpx.AsyncClient(timeout=12, verify=settings.bnb_rpc_tls_verify) as client:
                response = await client.post(
                    settings.bnb_rpc_url,
                    json={
                        "jsonrpc": "2.0",
                        "id": "getAmountsOut",
                        "method": "eth_call",
                        "params": [{"to": settings.bnb_pancake_swap_router_address, "data": data}, "latest"],
                    },
                )
                response.raise_for_status()
                payload = response.json()
        except httpx.HTTPError as error:
            raise ValueError(f"PancakeSwap getAmountsOut RPC failed: {error}") from error
        if payload.get("error"):
            raise ValueError(str(payload["error"].get("message") or payload["error"]))
        raw_result = str(payload.get("result") or "")
        if not raw_result.startswith("0x") or raw_result == "0x":
            raise ValueError("PancakeSwap getAmountsOut returned an empty result.")
        decoded = decode(["uint256[]"], bytes.fromhex(raw_result[2:]))[0]
        return [int(value) for value in decoded]

    @staticmethod
    def apply_slippage(value: str, slippage_bps: int) -> str:
        raw = int(value)
        return str((raw * (10_000 - slippage_bps)) // 10_000)

    @staticmethod
    def token_amount_from_usd(amount_usd: Decimal, price_usd: Decimal) -> Decimal:
        if price_usd <= 0:
            raise ValueError("priceUsd must be positive for sell quotes.")
        return amount_usd / price_usd

    @staticmethod
    def decimal_to_units(value: Decimal, decimals: int) -> str:
        scaled = (value * (Decimal(10) ** decimals)).quantize(Decimal("1"), rounding=ROUND_DOWN)
        return str(int(scaled))
