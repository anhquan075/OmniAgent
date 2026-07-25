"""Contract-source invariants for authoritative collateral enforcement."""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
VAULT_MAIN = ROOT / "contracts" / "collateral-vault" / "src" / "main.rs"
VAULT_INSTALL = ROOT / "contracts" / "collateral-vault" / "src" / "install.rs"
DECISION_MAIN = ROOT / "contracts" / "casper-decision-proof" / "src" / "main.rs"
DECISION_INSTALL = ROOT / "contracts" / "casper-decision-proof" / "src" / "install.rs"


def test_verified_vault_reads_authoritative_decision_receipt() -> None:
    source = VAULT_MAIN.read_text(encoding="utf-8")

    assert 'runtime::call_versioned_contract::<String>' in source
    assert "ContractPackageHash" in source
    assert '"get_decision_receipt"' in source
    assert '"decision_id" => decision_id.to_string()' in source
    assert "receipt != claimed_receipt" in source
    assert "ApiError::User(104)" in source


def test_verified_entry_points_are_distinct_from_rollback_path() -> None:
    source = VAULT_MAIN.read_text(encoding="utf-8")
    install = VAULT_INSTALL.read_text(encoding="utf-8")

    assert "fn enforce_verified()" in source
    assert "ENTRY_POINT_ENFORCE_VERIFIED" in install
    assert 'match action.as_str()' in source
    for action in ("block", "approve", "haircut"):
        assert f'"{action}" =>' in source

    # The legacy entry points remain callable for immediate environment rollback.
    for name in ("freeze", "unfreeze", "set_ltv"):
        assert f'fn {name}()' in source


def test_vault_wasm_reinstall_upgrades_in_place_instead_of_orphaning_state() -> None:
    """Re-running the vault Wasm must version the package, not fork it.

    A second ``new_contract`` reverts on the installer account named keys and
    would leave the live ``positions`` dictionary stranded on the old package.
    """
    install = VAULT_INSTALL.read_text(encoding="utf-8")

    assert "fn upgrade_contract()" in install
    assert "runtime::get_key(CONTRACT_ACCESS_UREF).is_some()" in install
    assert "storage::add_contract_version" in install
    # Empty named keys on upgrade preserve positions + stored proof/agent hashes.
    assert "NamedKeys::default()" in install


def test_contract_build_script_enforces_mvp_and_install_lane_size() -> None:
    script = (ROOT / "scripts" / "build-casper-contracts.sh").read_text(encoding="utf-8")

    assert "--mvp-features" in script
    assert "--signext-lowering" in script
    assert "MAX_BYTES" in script
    for crate in ("casper-decision-proof", "collateral-vault"):
        assert crate in script


def test_stack_verifier_builds_both_contracts() -> None:
    script = (ROOT / "scripts" / "verify-casper-buildathon-stack.sh").read_text(encoding="utf-8")

    assert "contracts/casper-decision-proof/Cargo.toml" in script
    assert "contracts/collateral-vault/Cargo.toml" in script


def test_decision_proof_upgrade_preserves_receipts_and_adds_getter() -> None:
    main = DECISION_MAIN.read_text(encoding="utf-8")
    install = DECISION_INSTALL.read_text(encoding="utf-8")

    assert "fn get_decision_receipt()" in main
    assert "storage::add_contract_version" in install
    assert "NamedKeys::default()" in install
    assert "ENTRY_POINT_GET_RECEIPT" in install


def test_decision_proof_record_decision_enforces_agent_acl() -> None:
    main = DECISION_MAIN.read_text(encoding="utf-8")
    install = DECISION_INSTALL.read_text(encoding="utf-8")
    keys = (ROOT / "contracts" / "casper-decision-proof" / "src" / "keys.rs").read_text(
        encoding="utf-8"
    )

    assert "fn require_authorized_agent()" in main
    assert "ApiError::User(130)" in main
    assert "ApiError::User(131)" in main
    assert "fn rotate_authorized_agent()" in main
    assert "AUTHORIZED_AGENT_KEY" in keys
    assert "ACL_SEEDED_MARKER" in keys
    assert "get_authorized_agent" in main
    assert "ACL_ROTATION_ENABLED_KEY" in keys
    assert 'runtime::try_get_named_arg::<String>("agent_account_hash")' in install
    assert "omniagent_decision_proof_acl_seeded" in keys
