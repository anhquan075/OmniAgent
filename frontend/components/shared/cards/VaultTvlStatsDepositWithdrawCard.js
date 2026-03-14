import { useState, useEffect } from "react";
import { RobotRouteProgress } from "../ui/RobotRouteProgress";
function computeSafeWithdrawable(totalAssetsRaw, wdkManagedAssets, decimals) {
  try {
    const total = BigInt(totalAssetsRaw ?? 0);
    const wdk = BigInt(wdkManagedAssets ?? 0);
    const safe = total > wdk ? total - wdk : 0n;
    const d = BigInt(10) ** BigInt(decimals ?? 18);
    const whole = safe / d;
    const frac = safe % d;
    const fracStr = frac.toString().padStart(Number(decimals ?? 18), "0").slice(0, 6);
    return `${whole}.${fracStr}`;
  } catch { return null; }
}

function Toast({ message, type, onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);
  
  return (
    <div className={`vaultToast vaultToast--${type}`}>
      <span>{message}</span>
      <button onClick={onClose}>&times;</button>
    </div>
  );
}

export function VaultTvlStatsDepositWithdrawCard({
  assets, riskState, shares, cycleCountVal,
  depositAmount, setDepositAmount, withdrawAmount, setWithdrawAmount,
  onDeposit, onWithdraw, canOperate, busyAction, isConnected,
  totalAssetsRaw, wdkManagedAssets, decimals, userTokenBalance,
}) {
  const [toast, setToast] = useState(null);
  
  const riskTone = riskState === "Normal" ? "statePill--normal"
    : riskState === "Guarded" ? "statePill--guarded"
    : riskState === "Drawdown" ? "statePill--drawdown"
    : "statePill--idle";

  const safeMax = computeSafeWithdrawable(totalAssetsRaw, wdkManagedAssets, decimals);
  const safeMaxNum = safeMax != null ? parseFloat(safeMax) : null;
  const withdrawNum = parseFloat(withdrawAmount);
  const withdrawExceedsSafe = safeMaxNum != null && withdrawAmount && withdrawNum > safeMaxNum;

  // Show balance when both token balance and decimals are available; "..." while loading
  const userBalanceFormatted = userTokenBalance != null && decimals != null
    ? (Number(userTokenBalance) / Number(10n ** BigInt(decimals))).toFixed(6)
    : null;
  const userBalanceDisplay = isConnected
    ? (userBalanceFormatted ?? "…")
    : null;

  const handleDeposit = () => {
    if (depositExceedsBalance) {
      setToast({ type: "error", message: `Insufficient balance. You have ${userBalanceFormatted} USDT.` });
      return;
    }
    onDeposit();
  };

  const handleWithdraw = () => {
    if (withdrawExceedsSafe) {
      setToast({ type: "error", message: `Max instantly withdrawable: ${safeMax} USDT.` });
      return;
    }
    onWithdraw();
  };
  
  const depositNum = parseFloat(depositAmount);
  const depositExceedsBalance = userBalanceFormatted != null && depositAmount && depositNum > parseFloat(userBalanceFormatted);

  return (
    <div className="card vaultMainCard">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <div className="vaultTvl">{assets ?? "—"}</div>
      <div className="vaultTvlLabel">Total Value Locked</div>

      <div className="vaultStatsRow">
        <div className="vaultStatItem">
          <span className="vaultStatLabel">Risk State</span>
          <span className={`statePill ${riskTone}`}>{riskState ?? "—"}</span>
        </div>
        <div className="vaultStatItem">
          <span className="vaultStatLabel">My Shares</span>
          <span className="vaultStatValue">{shares ?? "—"}</span>
        </div>
        <div className="vaultStatItem">
          <span className="vaultStatLabel">Cycle #</span>
          <span className="vaultStatValue">{cycleCountVal ?? "—"}</span>
        </div>
      </div>

      <div className="vaultActionsRow">
        <div className="vaultActionGroup">
          {busyAction === "deposit" ? (
            <RobotRouteProgress isExecuting={true} />
          ) : (
            <>
              <div className="vaultActionLabelRow">
                <label className="vaultActionLabel">Deposit (USDT)</label>
                {userBalanceDisplay != null && (
                  <button
                    className="vaultMaxBtn"
                    onClick={() => userBalanceFormatted && setDepositAmount(userBalanceFormatted)}
                    disabled={!canOperate || !userBalanceFormatted}
                    title="Your wallet USDT balance"
                  >
                    Max {userBalanceDisplay}
                  </button>
                )}
              </div>
              <input
                type="number"
                min="0"
                placeholder="0.00"
                value={depositAmount}
                onChange={e => setDepositAmount(e.target.value)}
                disabled={!canOperate}
                style={depositExceedsBalance ? { borderColor: "#ef4444" } : undefined}
              />
              <button type="button" onClick={handleDeposit} disabled={!canOperate || !depositAmount || depositExceedsBalance}>
                Deposit
              </button>
            </>
          )}
        </div>

        <div className="vaultActionGroup">
          <div className="vaultActionLabelRow">
            <label className="vaultActionLabel">Withdraw (USDT)</label>
            {safeMax != null && (
              <button
                className="vaultMaxBtn"
                onClick={() => setWithdrawAmount(safeMax)}
                disabled={!canOperate}
                title="Maximum instantly withdrawable (excludes WDKDEX locked funds)"
              >
                Max {safeMax}
              </button>
            )}
          </div>
          <input
            type="number"
            min="0"
            placeholder="0.00"
            value={withdrawAmount}
            onChange={e => setWithdrawAmount(e.target.value)}
            disabled={!canOperate}
            style={withdrawExceedsSafe ? { borderColor: "#ef4444" } : undefined}
          />
          <button type="button" className="alt" onClick={handleWithdraw} disabled={!canOperate || !withdrawAmount || withdrawExceedsSafe}>
            {busyAction === "withdraw" ? "Withdrawing…" : "Withdraw"}
          </button>
        </div>
      </div>

      {!isConnected && (
        <p className="vaultConnectHint" style={{ color: 'rgba(200,147,90,.7)', fontSize: 11, textAlign: 'center', marginTop: 6 }}>Connect wallet to deposit or withdraw</p>
      )}
    </div>
  );
}
