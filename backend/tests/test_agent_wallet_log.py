from app.services.agent.wallet_log import AgentWalletLogService


WALLET = "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25"
OTHER_WALLET = "0x1111111111111111111111111111111111111111"


def test_agent_wallet_log_preserves_ready_observed_wallet() -> None:
    result = AgentWalletLogService.build(
        {"walletAddress": WALLET, "twakServer": {"mode": "rest"}},
        {
            "ready": True,
            "mode": "rest",
            "observedWallet": WALLET,
            "expectedWallet": WALLET,
            "walletValidated": True,
            "actionsValidated": True,
        },
    )

    assert result["status"] == "ready"
    assert result["walletAddress"] == WALLET
    assert result["observedWallet"] == WALLET
    assert result["expectedWallet"] == WALLET
    assert result["configuredWallet"] == WALLET
    assert result["walletValidated"] is True


def test_agent_wallet_log_does_not_invent_observed_wallet() -> None:
    result = AgentWalletLogService.build(
        {"walletAddress": WALLET, "twakServer": {"mode": "rest"}},
        {
            "ready": False,
            "mode": "rest",
            "expectedWallet": WALLET,
            "walletValidated": False,
            "actionsValidated": True,
            "reason": "TWAK REST bridge did not expose a wallet address",
        },
    )

    assert result["status"] == "guarded"
    assert result["walletAddress"] is None
    assert result["observedWallet"] is None
    assert result["expectedWallet"] == WALLET
    assert result["configuredWallet"] == WALLET
    assert result["reason"] == "TWAK REST bridge did not expose a wallet address"


def test_agent_wallet_log_keeps_mismatched_wallets_separate() -> None:
    result = AgentWalletLogService.build(
        {"walletAddress": WALLET, "twakServer": {"mode": "rest"}},
        {
            "ready": False,
            "mode": "rest",
            "observedWallet": OTHER_WALLET,
            "expectedWallet": WALLET,
            "walletValidated": False,
            "actionsValidated": True,
            "reason": "TWAK wallet mismatch",
        },
    )

    assert result["walletAddress"] == OTHER_WALLET
    assert result["observedWallet"] == OTHER_WALLET
    assert result["expectedWallet"] == WALLET
    assert result["configuredWallet"] == WALLET
    assert result["walletValidated"] is False
