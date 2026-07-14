from typing import Any

from app.services.casper.openrouter_trace import OpenRouterTraceClient


class FakeOpenRouterResponse:
    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict[str, Any]:
        return {
            "id": "gen-test-123",
            "model": "deepseek/deepseek-v4-flash",
            "choices": [
                {
                    "message": {
                        "content": (
                            '{"proposer":{"verdict":"proposed","action":"approve",'
                            '"reasonCode":"risk_ok","rationale":"Evidence supports approval."},'
                            '"critic":{"verdict":"passed","reasonCode":"evidence_complete",'
                            '"rationale":"Sources are fresh."},'
                            '"policy_gate":{"verdict":"approved","reasonCode":"policy_approved",'
                            '"rationale":"No hard blockers."}}'
                        )
                    }
                }
            ],
        }


class FakeOpenRouterClient:
    def __init__(self, timeout: float, sink: dict[str, Any]):
        self.timeout = timeout
        self.sink = sink

    def __enter__(self) -> "FakeOpenRouterClient":
        return self

    def __exit__(self, *_args: object) -> None:
        return None

    def post(self, url: str, headers: dict[str, str], json: dict[str, Any]) -> FakeOpenRouterResponse:
        self.sink["url"] = url
        self.sink["headers"] = headers
        self.sink["json"] = json
        return FakeOpenRouterResponse()


def test_openrouter_trace_fetches_public_role_claims(monkeypatch) -> None:
    request: dict[str, Any] = {}
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-openrouter-key")
    monkeypatch.setenv("OPENROUTER_MODEL", "deepseek/deepseek-v4-flash")
    monkeypatch.setattr(
        "app.services.casper.openrouter_trace.httpx.Client",
        lambda timeout: FakeOpenRouterClient(timeout, request),
    )

    claims = OpenRouterTraceClient.fetch_role_claims(
        {
            "proposedAction": "approve",
            "evidenceBundle": {
                "riskScore": 22,
                "secretKey": "must-not-leave-process",
            },
        },
        [{"agentRole": "proposer", "verdict": "proposed", "action": "approve"}],
    )

    assert request["url"] == "https://openrouter.ai/api/v1/chat/completions"
    assert request["headers"]["Authorization"] == "Bearer test-openrouter-key"
    assert request["json"]["model"] == "deepseek/deepseek-v4-flash"
    assert request["json"]["response_format"] == {"type": "json_object"}
    assert "must-not-leave-process" not in request["json"]["messages"][1]["content"]
    assert claims["_meta"]["provider"] == "openrouter"
    assert claims["_meta"]["generationHash"].startswith("sha256:")
    assert claims["policy_gate"]["reasonCode"] == "policy_approved"
