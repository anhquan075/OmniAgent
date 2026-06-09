import json

from app.core.logging import configure_logging, get_logger


def test_configure_logging_emits_json_by_default(monkeypatch, capsys) -> None:
    monkeypatch.delenv("OMNIAGENT_LOG_JSON", raising=False)

    configure_logging()
    logger = get_logger("test")
    logger.info("json_log_smoke", component="test")

    line = capsys.readouterr().out.strip().splitlines()[-1]
    payload = json.loads(line)
    assert payload["event"] == "json_log_smoke"
    assert payload["component"] == "test"
    assert payload["logger"] == "test"
    assert payload["level"] == "info"


def test_configure_logging_can_emit_to_stderr(monkeypatch, capsys) -> None:
    monkeypatch.setenv("OMNIAGENT_LOG_STREAM", "stderr")

    configure_logging()
    logger = get_logger("test")
    logger.info("stderr_log_smoke")

    line = capsys.readouterr().err.strip().splitlines()[-1]
    payload = json.loads(line)
    assert payload["event"] == "stderr_log_smoke"
