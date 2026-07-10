from concurrent.futures import ThreadPoolExecutor
import subprocess
from threading import Event

from app.services.casper.submitter import CasperCliSubmitter


def configure_submitter(monkeypatch) -> None:
    monkeypatch.setenv("CASPER_SECRET_KEY_PATH", "/tmp/casper-secret.pem")
    monkeypatch.setenv("CASPER_DECISION_CONTRACT_HASH", "a" * 64)


def test_submit_timeout_is_an_unknown_outcome(monkeypatch) -> None:
    def timeout(*args, **kwargs):
        raise subprocess.TimeoutExpired(cmd="casper-client", timeout=30)

    monkeypatch.setattr(subprocess, "run", timeout)

    result = CasperCliSubmitter.run_command(["casper-client", "put-deploy"], "casper_cli_submit")

    assert result["status"] == "outcome_unknown"
    assert result["outcomeUnknown"] is True
    assert result["hardBlockers"] == ["casper_cli_submit_timeout"]


def test_success_without_returned_hash_is_an_unknown_outcome(monkeypatch) -> None:
    configure_submitter(monkeypatch)
    monkeypatch.setattr(
        CasperCliSubmitter,
        "run_command",
        staticmethod(lambda command, prefix: {
            "status": "ready",
            "hardBlockers": [],
            "cliCommand": command,
            "cliOutput": "accepted without a response hash",
        }),
    )

    result = CasperCliSubmitter.submit_decision({"decisionId": "decision-1"})

    assert result["status"] == "outcome_unknown"
    assert result["outcomeUnknown"] is True
    assert result["hardBlockers"] == ["casper_cli_transaction_hash_missing"]


def test_submit_process_failure_is_conservatively_unknown(monkeypatch) -> None:
    monkeypatch.setattr(
        subprocess,
        "run",
        lambda *args, **kwargs: subprocess.CompletedProcess(
            args=["casper-client"],
            returncode=1,
            stdout="",
            stderr="connection closed before response",
        ),
    )

    result = CasperCliSubmitter.run_command(["casper-client", "put-deploy"], "casper_cli_submit")

    assert result["status"] == "outcome_unknown"
    assert result["outcomeUnknown"] is True


def test_process_lock_rejects_concurrent_submit(monkeypatch) -> None:
    configure_submitter(monkeypatch)
    started = Event()
    release = Event()

    def blocking_run(command, prefix):
        started.set()
        assert release.wait(timeout=5)
        return {
            "status": "ready",
            "hardBlockers": [],
            "cliCommand": command,
            "cliOutput": '{"deploy_hash":"' + "b" * 64 + '"}',
        }

    monkeypatch.setattr(CasperCliSubmitter, "run_command", staticmethod(blocking_run))
    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(CasperCliSubmitter.submit_decision, {"decisionId": "decision-1"})
        assert started.wait(timeout=5)
        second = CasperCliSubmitter.submit_decision({"decisionId": "decision-2"})
        release.set()
        first_result = first.result(timeout=5)

    assert first_result["submitted"] is True
    assert second["submitted"] is False
    assert second["hardBlockers"] == ["casper_submit_in_progress"]
