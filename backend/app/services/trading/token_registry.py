from dataclasses import dataclass

from app.core.settings import get_settings

BNB_NATIVE_TOKEN_ADDRESS = "native"
WBNB_ADDRESS = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c"

@dataclass(frozen=True)
class BnbToken:
    symbol: str
    address: str
    decimals: int
    eligible_for_competition: bool
    native: bool = False

TOKEN_REGISTRY: dict[str, BnbToken] = {
    "BNB": BnbToken("BNB", BNB_NATIVE_TOKEN_ADDRESS, 18, True, True),
    "WBNB": BnbToken("WBNB", WBNB_ADDRESS, 18, True),
    "USDT": BnbToken("USDT", "0x55d398326f99059fF775485246999027B3197955", 18, True),
    "USDC": BnbToken("USDC", "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", 18, True),
    "CAKE": BnbToken("CAKE", "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82", 18, True),
    "TWT": BnbToken("TWT", "0x4B0F1812e5Df2A09796481Ff14017e6005508003", 18, True),
}

class TokenRegistryService:
    @staticmethod
    def get_token(symbol: str) -> BnbToken | None:
        return TOKEN_REGISTRY.get(symbol.upper())

    @staticmethod
    def is_token_allowed(symbol: str) -> bool:
        settings = get_settings()
        token = TokenRegistryService.get_token(symbol)
        return bool(token and token.symbol in settings.token_allowlist)
