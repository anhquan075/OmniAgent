import { useCallback, useEffect, useState } from "react";
import { Gavel } from "lucide-react";

import { executionAuctionAbi, erc20Abi } from "@/lib/abi";
import { fmtUsdf } from "@/lib/vaultDisplayFormatters";

const PHASE_LABELS = ["NotOpen", "BidPhase", "ExecutePhase", "FallbackPhase"];
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

function shortAddr(addr) {
  if (!addr || addr === ZERO_ADDR) return "none";
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

function fmtSeconds(secs) {
  if (!secs || secs <= 0) return "0s";
  const n = Number(secs);
  const m = Math.floor(n / 60);
  const s = n % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function fmtMinutes(secs) {
  if (!secs) return "—";
  const n = Number(secs);
  const m = Math.floor(n / 60);
  const s = n % 60;
  return m > 0 ? `${m}m ${s > 0 ? ` ${s}s` : ""}` : `${s}s`;
}

/** Phase progress bar — fills left-to-right as time within window elapses */
function PhaseProgressBar({
  phase,
  bidTimeRemaining,
  executeTimeRemaining,
  auctionParams,
}) {
  if (phase === 0 || !auctionParams) return null;

  let windowSecs = 0;
  let elapsedSecs = 0;
  let color = "var(--text-muted)";

  if (phase === 1 && auctionParams.bidWindow) {
    windowSecs = Number(auctionParams.bidWindow);
    elapsedSecs = windowSecs - Number(bidTimeRemaining ?? 0);
    color = "var(--accent)";
  } else if (phase === 2 && auctionParams.executeWindow) {
    windowSecs = Number(auctionParams.executeWindow);
    elapsedSecs = windowSecs - Number(executeTimeRemaining ?? 0);
    color = "var(--success)";
  } else if (phase === 3) {
    // Fallback: full bar, warning color
    windowSecs = 1;
    elapsedSecs = 1;
    color = "var(--warning)";
  }

  const pct =
    windowSecs > 0
      ? Math.min(100, Math.max(0, (elapsedSecs / windowSecs) * 100))
      : 0;

  return (
    <div style={{ marginTop: 10 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 4,
          fontSize: 10,
          color: "var(--text-muted)",
        }}
      >
        <span>Phase elapsed</span>
        <span style={{ color }}>{pct.toFixed(0)}%</span>
      </div>
      <div className="thresholdTrack">
        <span
          className="thresholdFill"
          style={{
            width: `${pct}%`,
            background: color,
            display: "block",
            height: "100%",
            borderRadius: 0,
          }}
        />
      </div>
    </div>
  );
}

/** Small info row used in the auction params panel */
function InfoRow({ label, value, valueColor }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        fontSize: 11,
      }}
    >
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <span style={{ color: valueColor ?? "var(--text)", fontWeight: 600 }}>
        {value}
      </span>
    </div>
  );
}

export function VaultExecutionAuctionRraBidCard({
  executionAuctionAddress,
  tokenAddress,
  signer,
  walletAddress,
  canOperate,
  busyAction,
  onBusyChange,
  onStatus,
}) {
  const [roundStatus, setRoundStatus] = useState(null);
  const [auctionStats, setAuctionStats] = useState(null);
  const [pendingRefund, setPendingRefund] = useState(null);
  const [auctionParams, setAuctionParams] = useState(null); // immutables, fetched once
  const [bidAmount, setBidAmount] = useState("");
  const [loading, setLoading] = useState(false);

  /** Fetch immutable auction parameters once (they never change) */

  /** Fetch immutable auction parameters once (they never change) */
  const fetchParams = useCallback(async () => {
    if (
      !executionAuctionAddress ||
      executionAuctionAddress === ZERO_ADDR ||
      !signer
    )
      return;
    try {
      const ethersLib = await import("ethers");
      const auction = new ethersLib.Contract(
        ethersLib.getAddress(executionAuctionAddress),
        executionAuctionAbi,
        signer
      );
      const [bidWindow, executeWindow, minBid, minBidIncrementBps] =
        await Promise.all([
          auction.bidWindow().catch(() => null),
          auction.executeWindow().catch(() => null),
          auction.minBid().catch(() => null),
          auction.minBidIncrementBps().catch(() => null),
        ]);
      setAuctionParams({
        bidWindow,
        executeWindow,
        minBid,
        minBidIncrementBps,
      });
    } catch {
      // silent
    }
  }, [executionAuctionAddress, signer]);

  const fetchState = useCallback(async () => {
    if (!executionAuctionAddress || executionAuctionAddress === ZERO_ADDR)
      return;
    try {
      const ethersLib = await import("ethers");
      const provider = signer ?? null;
      if (!provider) return;
      const auction = new ethersLib.Contract(
        ethersLib.getAddress(executionAuctionAddress),
        executionAuctionAbi,
        provider
      );
      const [status, stats] = await Promise.all([
        auction.roundStatus().catch(() => null),
        auction.stats().catch(() => null),
      ]);
      if (status) {
        setRoundStatus({
          id: status.id,
          currentPhase: Number(status.currentPhase),
          winner: status.winner,
          winningBid: status.winningBid,
          bidTimeRemaining: status.bidTimeRemaining,
          executeTimeRemaining: status.executeTimeRemaining,
        });
      }
      if (stats) {
        setAuctionStats({
          totalRounds: stats.totalRounds,
          bidRevenue: stats.bidRevenue,
          currentPhase: Number(stats.currentPhase_),
        });
      }
      if (walletAddress) {
        const refund = await auction
          .pendingRefunds(walletAddress)
          .catch(() => null);
        setPendingRefund(refund);
      }
    } catch {
      // silent — no provider yet
    }
  }, [executionAuctionAddress, signer, walletAddress]);

  // Fetch immutables once on mount / address change
  useEffect(() => {
    fetchParams();
  }, [fetchParams]);

  // Poll live state every 15s
  useEffect(() => {
    fetchState();
    const id = setInterval(fetchState, 15000);
    return () => clearInterval(id);
  }, [fetchState]);

  const handleBid = useCallback(async () => {
    if (!signer || !executionAuctionAddress || !bidAmount) return;
    onBusyChange?.("auction-bid");
    setLoading(true);
    try {
      const ethersLib = await import("ethers");
      const auction = new ethersLib.Contract(
        ethersLib.getAddress(executionAuctionAddress),
        executionAuctionAbi,
        signer
      );
      const decimals = 18n;
      const amount = ethersLib.parseUnits(bidAmount, decimals);

      if (tokenAddress) {
        const token = new ethersLib.Contract(
          ethersLib.getAddress(tokenAddress),
          erc20Abi,
          signer
        );
        onStatus?.("Approving bid token...");
        const approveTx = await token.approve(executionAuctionAddress, amount, {
          gasLimit: 100000,
        });
        await approveTx.wait();
      }

      onStatus?.("Placing bid...");
      const tx = await auction.bid(amount, {
        gasLimit: 300000,
      });
      await tx.wait();
      onStatus?.("Bid placed");
      setBidAmount("");
      await fetchState();
    } catch (err) {
      onStatus?.(err.message);
    } finally {
      onBusyChange?.(null);
      setLoading(false);
    }
  }, [
    signer,
    executionAuctionAddress,
    tokenAddress,
    bidAmount,
    fetchState,
    onBusyChange,
    onStatus,
  ]);

  const handleWinnerExecute = useCallback(async () => {
    if (!signer || !executionAuctionAddress) return;
    onBusyChange?.("auction-winner-execute");
    setLoading(true);
    try {
      const ethersLib = await import("ethers");
      const auction = new ethersLib.Contract(
        ethersLib.getAddress(executionAuctionAddress),
        executionAuctionAbi,
        signer
      );
      onStatus?.("Executing as winner...");
      const tx = await auction.winnerExecute({
        gasLimit: 5000000, // Winner execution can be heavy rebalance
      });
      await tx.wait();
      onStatus?.("Winner execute confirmed");
      await fetchState();
    } catch (err) {
      onStatus?.(err.message);
    } finally {
      onBusyChange?.(null);
      setLoading(false);
    }
  }, [signer, executionAuctionAddress, fetchState, onBusyChange, onStatus]);

  const handleFallbackExecute = useCallback(async () => {
    if (!signer || !executionAuctionAddress) return;
    onBusyChange?.("auction-fallback");
    setLoading(true);
    try {
      const ethersLib = await import("ethers");
      const auction = new ethersLib.Contract(
        ethersLib.getAddress(executionAuctionAddress),
        executionAuctionAbi,
        signer
      );
      onStatus?.("Fallback executing...");
      const tx = await auction.fallbackExecute({
        gasLimit: 5000000, // Fallback execution is a full rebalance
      });
      await tx.wait();
      onStatus?.("Fallback execute confirmed");
      await fetchState();
    } catch (err) {
      onStatus?.(err.message);
    } finally {
      onBusyChange?.(null);
      setLoading(false);
    }
  }, [signer, executionAuctionAddress, fetchState, onBusyChange, onStatus]);

  const handleClaimRefund = useCallback(async () => {
    if (!signer || !executionAuctionAddress) return;
    onBusyChange?.("auction-refund");
    setLoading(true);
    try {
      const ethersLib = await import("ethers");
      const auction = new ethersLib.Contract(
        ethersLib.getAddress(executionAuctionAddress),
        executionAuctionAbi,
        signer
      );
      onStatus?.("Claiming refund...");
      const tx = await auction.claimRefund({
        gasLimit: 150000,
      });
      await tx.wait();
      onStatus?.("Refund claimed");
      await fetchState();
    } catch (err) {
      onStatus?.(err.message);
    } finally {
      onBusyChange?.(null);
      setLoading(false);
    }
  }, [signer, executionAuctionAddress, fetchState, onBusyChange, onStatus]);

  const phase = roundStatus?.currentPhase ?? 0;
  const phaseLabel = PHASE_LABELS[phase] ?? "Unknown";
  const isWinner =
    walletAddress &&
    roundStatus?.winner?.toLowerCase() === walletAddress.toLowerCase();
  const isBusy = loading || !!busyAction;
  const hasPendingRefund = pendingRefund != null && pendingRefund > 0n;

  const phaseTone =
    phase === 1
      ? "var(--accent)"
      : phase === 2
      ? "var(--success)"
      : phase === 3
      ? "var(--warning)"
      : "var(--text-muted)";

  // Minimum next bid — current winning + increment, or minBid if no bids yet
  const minNextBid = (() => {
    if (!auctionParams?.minBid) return null;
    const base =
      roundStatus?.winningBid && roundStatus.winningBid > 0n
        ? roundStatus.winningBid
        : null;
    if (!base || !auctionParams.minBidIncrementBps)
      return fmtUsdf(auctionParams.minBid);
    // base * (10000 + minBidIncrementBps) / 10000
    const inc =
      (base * (10000n + BigInt(auctionParams.minBidIncrementBps))) / 10000n;
    return fmtUsdf(inc);
  })();

  return (
    <div className="card">
      <div>
        <p className="eyebrow" style={{ margin: 0 }}>
          Execution Auction (RRA)
        </p>
        <h3 className="cardTitle" style={{ margin: "2px 0 0" }}>
          <Gavel size={13} style={{ marginRight: 6, opacity: 0.7 }} />
          Keeper Bid System
        </h3>
      </div>
      <div
        className="kpiGrid"
        style={{
          marginTop: 12,
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
        }}
      >
        <div className="kpi">
          <span className="kpiLabel">Round</span>
          <span className="kpiValue">
            #{roundStatus?.id != null ? String(roundStatus.id) : "—"}
          </span>
        </div>
        <div className="kpi">
          <span className="kpiLabel">Phase</span>
          <span className="kpiValue" style={{ color: phaseTone }}>
            {phaseLabel}
          </span>
        </div>
        <div className="kpi">
          <span className="kpiLabel">Total Rounds</span>
          <span className="kpiValue">
            {auctionStats?.totalRounds != null
              ? String(auctionStats.totalRounds)
              : "—"}
          </span>
        </div>
      </div>

      {/* ─── Phase progress bar (only when active) ─── */}
      <PhaseProgressBar
        phase={phase}
        bidTimeRemaining={roundStatus?.bidTimeRemaining}
        executeTimeRemaining={roundStatus?.executeTimeRemaining}
        auctionParams={auctionParams}
      />
      {/* ─── How it works (always visible) ─── */}
      <div
        style={{
          marginTop: 14,
          borderTop: "1px dashed rgba(255,255,255,.06)",
          paddingTop: 12,
        }}
      >
        <p
          style={{
            margin: "0 0 8px",
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: ".1em",
            color: "var(--accent)",
            fontWeight: 700,
          }}
        >
          How It Works
        </p>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 7,
            color: "rgba(240,212,168,0.7)",
            fontSize: 11,
            lineHeight: 1.6,
          }}
        >
          <div style={{ display: "flex", gap: 7 }}>
            <span
              style={{ color: "var(--accent)", flexShrink: 0, fontWeight: 700 }}
            >
              ①
            </span>
            <span>
              Bidders compete for the right to execute the rebalance cycle.
            </span>
          </div>
          <div style={{ display: "flex", gap: 7 }}>
            <span
              style={{ color: "var(--accent)", flexShrink: 0, fontWeight: 700 }}
            >
              ②
            </span>
            <span>
              Highest bid wins. Outbid amounts are refundable immediately.
            </span>
          </div>
          <div style={{ display: "flex", gap: 7 }}>
            <span
              style={{ color: "var(--accent)", flexShrink: 0, fontWeight: 700 }}
            >
              ③
            </span>
            <span>
              Winner calls{" "}
              <strong style={{ color: "rgba(240,212,168,1)" }}>Execute</strong>{" "}
              to run the cycle and earn the bounty. Bid fee accrues to the
              vault.
            </span>
          </div>
          <div style={{ display: "flex", gap: 7 }}>
            <span style={{ color: "#C8935A", flexShrink: 0, fontWeight: 700 }}>
              ④
            </span>
            <span>
              If winner doesn't execute in time, anyone may{" "}
              <strong style={{ color: "rgba(240,212,168,1)" }}>
                Fallback Execute
              </strong>
              .
            </span>
          </div>
        </div>
      </div>

      {/* ─── Auction Parameters ─── */}
      {auctionParams && (
        <div
          style={{
            marginTop: 14,
            borderTop: "1px dashed rgba(255,255,255,.06)",
            paddingTop: 12,
          }}
        >
          <p
            style={{
              margin: "0 0 8px",
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: ".1em",
              color: "var(--accent)",
              fontWeight: 700,
            }}
          >
            Auction Parameters
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <InfoRow
              label="Bid Window"
              value={fmtMinutes(auctionParams.bidWindow)}
            />
            <InfoRow
              label="Execute Window"
              value={fmtMinutes(auctionParams.executeWindow)}
            />
            <InfoRow label="Min Bid" value={fmtUsdf(auctionParams.minBid)} />
            <InfoRow
              label="Min Bid Increment"
              value={
                auctionParams.minBidIncrementBps != null
                  ? `${(Number(auctionParams.minBidIncrementBps) / 100).toFixed(
                      2
                    )}%`
                  : "—"
              }
            />
          </div>
        </div>
      )}
      {/* ─── NotOpen explainer ─── */}
      {phase === 0 && (
        <div
          style={{
            marginTop: 14,
            borderTop: "1px dashed rgba(255,255,255,.06)",
            paddingTop: 12,
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 11,
              color: "var(--text-muted)",
              lineHeight: 1.6,
            }}
          >
            No round is active. A new round opens automatically when the next{" "}
            <span style={{ color: "var(--text)" }}>bid()</span> is placed — any
            address can open a round by submitting a bid once the strategy
            engine cycle is ready.
          </p>
          {auctionStats?.bidRevenue != null && auctionStats.bidRevenue > 0n && (
            <div
              style={{
                marginTop: 10,
                display: "flex",
                justifyContent: "space-between",
                fontSize: 11,
              }}
            >
              <span style={{ color: "var(--text-muted)" }}>
                Lifetime bid revenue
              </span>
              <span style={{ color: "var(--accent)", fontWeight: 600 }}>
                {fmtUsdf(auctionStats.bidRevenue)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* ─── Live bid state (active round) ─── */}
      {phase > 0 && (
        <div
          style={{
            marginTop: 12,
            fontSize: 11,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <InfoRow
            label="Winning bid"
            value={fmtUsdf(roundStatus?.winningBid)}
          />
          <InfoRow
            label="Winner"
            value={`${shortAddr(roundStatus?.winner)}${
              isWinner ? " (you)" : ""
            }`}
            valueColor={isWinner ? "var(--success)" : "var(--text)"}
          />
          {phase === 1 && roundStatus?.bidTimeRemaining != null && (
            <InfoRow
              label="Bid time left"
              value={fmtSeconds(roundStatus.bidTimeRemaining)}
              valueColor="var(--accent)"
            />
          )}
          {phase === 2 && roundStatus?.executeTimeRemaining != null && (
            <InfoRow
              label="Execute time left"
              value={fmtSeconds(roundStatus.executeTimeRemaining)}
              valueColor="var(--success)"
            />
          )}
          {auctionStats?.bidRevenue != null && (
            <InfoRow
              label="Lifetime bid revenue"
              value={fmtUsdf(auctionStats.bidRevenue)}
            />
          )}
          {minNextBid && phase === 1 && (
            <InfoRow
              label="Min next bid"
              value={minNextBid}
              valueColor="var(--accent)"
            />
          )}
        </div>
      )}

      {/* ─── Bid input (BidPhase only) ─── */}
      {phase === 1 && (
        <div
          style={{
            marginTop: 14,
            borderTop: "1px dashed rgba(255,255,255,.08)",
            paddingTop: 12,
          }}
        >
          <p className="eyebrow" style={{ marginBottom: 8 }}>
            Place Bid
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder={minNextBid ? `Min: ${minNextBid}` : "Bid amount"}
              value={bidAmount}
              onChange={(e) => setBidAmount(e.target.value)}
              disabled={isBusy || !canOperate}
              style={{ flex: 1 }}
            />
            <button
              onClick={handleBid}
              disabled={isBusy || !canOperate || !bidAmount}
            >
              Bid
            </button>
          </div>
        </div>
      )}

      {/* ─── Action buttons ─── */}
      <div
        style={{
          marginTop: 12,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {phase === 2 && (
          <button
            onClick={handleWinnerExecute}
            disabled={isBusy || !canOperate || !isWinner}
            title={!isWinner ? "Only the winning bidder can execute" : ""}
          >
            Execute (Winner)
          </button>
        )}
        {phase === 3 && (
          <button
            onClick={handleFallbackExecute}
            disabled={isBusy || !canOperate}
          >
            Fallback Execute
          </button>
        )}
        {hasPendingRefund && (
          <button onClick={handleClaimRefund} disabled={isBusy || !canOperate}>
            Claim Refund ({fmtUsdf(pendingRefund)})
          </button>
        )}
      </div>

      {(!executionAuctionAddress || executionAuctionAddress === ZERO_ADDR) && (
        <p className="opsHint" style={{ marginTop: 10 }}>
          ExecutionAuction not deployed on this network
        </p>
      )}
    </div>
  );
}
