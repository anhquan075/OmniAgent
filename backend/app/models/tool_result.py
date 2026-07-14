from pydantic import BaseModel, ConfigDict, Field


class ToolResult(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True)

    network: str = "casper"
    meta: dict[str, object] = Field(
        default_factory=lambda: {
            "executedBy": "casper_agent",
        },
        alias="_meta",
    )
