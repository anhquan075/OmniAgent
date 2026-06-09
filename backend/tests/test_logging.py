import json

from loguru import logger

from app.core.logging import configure_logging


def test_configure_logging_emits_json_by_default(monkeypatch, capsys) -> None:
    monkeypatch.delenv("OMNIAGENT_LOG_JSON", raising=False)

    configure_logging()
    logger.bind(event="json_log_smoke", component="test").info("json log smoke")

    line = capsys.readouterr().err.strip().splitlines()[-1]
    payload = json.loads(line)
    assert payload["record"]["message"] == "json log smoke"
    assert payload["record"]["extra"]["event"] == "json_log_smoke"
    assert payload["record"]["extra"]["component"] == "test"
