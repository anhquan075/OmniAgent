from pydantic import BaseModel, ConfigDict, Field


class ToolResult(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True)

    network: str = "bsc"
    meta: dict[str, object] = Field(
        default_factory=lambda: {
            "executedBy": "agent_wallet",
            "userWallet": None,
            "walletConnected": False,
        },
        alias="_meta",
    )
