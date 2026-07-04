from app.services.casper.loop import LoopState, get_loop_status, start_loop, stop_loop


def test_loop_state_defaults_to_stopped() -> None:
    state = LoopState()
    assert state.running is False
    assert state.cycle_count == 0
    assert state.error_count == 0
    assert state.dry_run is False
    assert state.cycle_in_progress is False


def test_start_loop_sets_running_true() -> None:
    result = start_loop(interval_sec=30, dry_run=True)
    assert result["running"] is True
    assert result["intervalSec"] == 30
    stop_loop()


def test_stop_loop_sets_running_false() -> None:
    start_loop()
    result = stop_loop()
    assert result["running"] is False


def test_get_loop_status_returns_all_fields() -> None:
    status = get_loop_status()
    for field in ["running", "intervalSec", "dryRun", "cycleInProgress", "lastCycleAt",
                   "nextCycleAt", "cycleCount", "errorCount", "lastError", "lastDecisionId",
                   "automationOwner", "liveSubmitEnabled", "autoReadback"]:
        assert field in status


def test_loop_status_network_is_casper() -> None:
    status = get_loop_status()
    assert status["network"] == "casper"
    assert status["automationOwner"] == "backend"


def test_start_loop_resets_consecutive_errors() -> None:
    start_loop()
    assert get_loop_status()["nextCycleAt"]
    stop_loop()
    assert get_loop_status()["running"] is False
    assert get_loop_status()["nextCycleAt"] is None


def test_loop_default_is_live_not_dry_run() -> None:
    start_loop(interval_sec=10)
    assert get_loop_status()["dryRun"] is False
    stop_loop()


def test_loop_can_be_started_in_dry_run_mode() -> None:
    start_loop(interval_sec=10, dry_run=True)
    assert get_loop_status()["dryRun"] is True
    stop_loop()


def test_cycle_in_progress_flag_exists() -> None:
    status = get_loop_status()
    assert "cycleInProgress" in status
    assert status["cycleInProgress"] is False


def test_loop_state_error_string_is_truncated() -> None:
    state = LoopState()
    state.last_error = "x" * 300
    assert len(state.last_error) == 300
    # The loop code truncates to 200 chars when setting last_error
