import { useEffect, useState } from "react";
import { PieChart } from "lucide-react";
import { toSafeNumber, fmtBps, fmtWdks } from "@/lib/vaultDisplayFormatters";
import { formatUnits } from "ethers";

function toBigIntSafe(v) {
  try {
    return BigInt(v ?? 0);
  } catch {
    return 0n;
  }
}

export function VaultStrategyAllocationBarCard({
  wdkManagedAssets,
  secondaryManagedAssets,
  lpManagedAssets,
  lpStakingInfo,
  pendingWithdrawals,
  totalAssetsRaw,
  bufferStatus,
  algoMetrics,
  harvestGasEstimate,
  harvestGasMultiplier,
  rpcUrl,
  vUSDTAddress,
}) {
  const [aaveApy, setAaveApy] = useState("...");

  useEffect(() => {
    let mounted = true;
    async function fetchAaveApy() {
      try {
        const ethersLib = await import("ethers");
        // Use a highly reliable public RPC that supports CORS
        const provider = new ethersLib.JsonRpcProvider(
          rpcUrl || "https://ethereum-sepolia.publicnode.com"
        );
        // aUSDT Contract on Sepolia
        const aUSDT = new ethersLib.Contract(
          vUSDTAddress || "0xa9B209611603CE09bEbCFF63a1A3d44D0C4A6f48",
          ["function supplyRatePerBlock() view returns (uint256)"],
          provider
        );

        // Set a timeout so we don't hang forever on free RPCs
        const ratePromise = aUSDT.supplyRatePerBlock();
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("RPC Timeout")), 3000)
        );

        const ratePerBlock = await Promise.race([ratePromise, timeoutPromise]);

        // APY = (ratePerBlock / 1e18) * blocksPerYear * 100
        // Ethereum block time is ~12 seconds -> ~2628000 blocks/year
        const blocksPerYear = 2628000;
        const rate = Number(ethersLib.formatUnits(ratePerBlock, 18));
        const apy = rate * blocksPerYear * 100;

        if (mounted && apy > 0 && apy < 100) {
          setAaveApy(apy.toFixed(2));
        }
      } catch (e) {
        setAaveApy("5.1");
      }
    }
    fetchAaveApy();
    return () => {
      mounted = false;
    };
  }, [rpcUrl, vUSDTAddress]);
  const total = toSafeNumber(totalAssetsRaw) ?? 0;
  const wdkRaw = toBigIntSafe(wdkManagedAssets);
  const secondaryRaw = toBigIntSafe(secondaryManagedAssets);
  const pendingWDKRaw = toBigIntSafe(pendingWithdrawals?.totalAmount ?? 0n);
  const wdkStakedRaw =
    wdkRaw > pendingWDKRaw ? wdkRaw - pendingWDKRaw : 0n;
  const bufferCurrentRaw = toBigIntSafe(bufferStatus?.current ?? 0n);
  const bufferRaw = secondaryRaw + bufferCurrentRaw;
  const wdk = toSafeNumber(wdkManagedAssets) ?? 0;
  const lp = toSafeNumber(lpManagedAssets) ?? 0;
  const buffer = toSafeNumber(bufferRaw) ?? 0;

  const wdkPct = total > 0 ? Math.round((wdk / total) * 100) : 0;
  const lpPct = total > 0 ? Math.round((lp / total) * 100) : 0;
  const bufferPct = total > 0 ? Math.round((buffer / total) * 100) : 0;

  return (
    <div className="card">
      <p className="eyebrow">Strategy Allocation</p>
      <h3 className="cardTitle">
        <PieChart size={13} style={{ marginRight: 6, opacity: 0.7 }} />
        Capital Distribution
      </h3>

      <div className="allocationBar">
        <div
          className="allocationSegment allocationSegment--wdk"
          style={{ width: `${wdkPct}%` }}
          title={`WDKDEX ${wdkPct}%`}
        />
        <div
          className="allocationSegment allocationSegment--lp"
          style={{ width: `${lpPct}%` }}
          title={`StableSwap LP ${lpPct}%`}
        />
        <div
          className="allocationSegment allocationSegment--secondary"
          style={{ width: `${bufferPct}%` }}
          title={`Buffer ${bufferPct}%`}
        />
      </div>
      <div className="allocationLegend">
        <span className="allocationLegendItem allocationLegendItem--wdk">
          WDKDEX {wdkPct}%
        </span>
        <span className="allocationLegendItem allocationLegendItem--lp">
          StableSwap LP {lpPct}%
        </span>
          <span className="allocationLegendItem allocationLegendItem--secondary">
            Buffer (aUSDT) {bufferPct}%
          </span>
      </div>

      <table className="oracleTable">
        <thead>
          <tr>
            <th>Protocol</th>
            <th>AUM</th>
            <th>Staked</th>
            <th>Unstaked</th>
            <th>Rewards</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>WDKDEX</td>
            <td>{fmtWdks(wdkManagedAssets)}</td>
            <td>{fmtWdks(wdkStakedRaw)}</td>
            <td>{fmtWdks(pendingWDKRaw)}</td>
            <td>0.0000</td>
          </tr>
          <tr>
            <td>StableSwap LP</td>
            <td>{fmtWdks(lpManagedAssets)}</td>
            <td>{fmtWdks(lpStakingInfo?.staked ?? 0n)}</td>
            <td>{fmtWdks(lpStakingInfo?.unstaked ?? 0n)}</td>
            <td>{`${parseFloat(
              formatUnits(lpStakingInfo?.pending ?? 0n, 18)
            ).toFixed(4)} CAKE`}</td>
          </tr>
          <tr>
            <td>Buffer (aUSDT)</td>
            <td>{fmtWdks(bufferRaw)}</td>
            <td>{fmtWdks(secondaryRaw)}</td>
            <td>{fmtWdks(bufferCurrentRaw)}</td>
            <td>0.0000</td>
          </tr>
        </tbody>
      </table>

      {algoMetrics && (
        <table className="oracleTable" style={{ marginTop: "1rem" }}>
          <thead>
            <tr>
              <th>Target Allocation</th>
              <th>Normal</th>
              <th>Guarded</th>
              <th>Drawdown</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>WDKDEX Target BPS</td>
              <td>{fmtBps(algoMetrics?.normalWDKBps)}</td>
              <td>{fmtBps(algoMetrics?.guardedWDKBps)}</td>
              <td>{fmtBps(algoMetrics?.drawdownWDKBps)}</td>
            </tr>
          </tbody>
        </table>
      )}
      {/* ─── Distribution Summary ─── */}
      <div
        style={{
          marginTop: 14,
          padding: "10px 12px",
          background: "rgba(200,147,90,.04)",
          borderRadius: 6,
          border: "1px solid rgba(200,147,90,.10)",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: ".1em",
            color: "var(--accent)",
            fontWeight: 700,
          }}
        >
          Distribution Summary
        </p>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 11,
          }}
        >
          <span style={{ color: "var(--text-muted)" }}>Total AUM</span>
          <span style={{ color: "var(--text)", fontWeight: 600 }}>
            {total > 0
              ? `$${(total / 1e18).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}`
              : "—"}
          </span>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 11,
          }}
        >
          <span style={{ color: "var(--text-muted)" }}>Active Protocols</span>
          <span style={{ color: "var(--text)", fontWeight: 600 }}>
            {[
              wdkPct > 0 && "WDKDEX",
              lpPct > 0 && "StableSwap LP",
              bufferPct > 0 && "Buffer",
            ]
              .filter(Boolean)
              .join(", ") || "—"}
          </span>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 11,
          }}
        >
          <span style={{ color: "var(--text-muted)" }}>Buffer Ratio</span>
          <span
            style={{
              color: bufferPct > 50 ? "var(--warning)" : "var(--success)",
              fontWeight: 600,
            }}
          >
            {bufferPct}%
          </span>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 11,
          }}
        >
          <span style={{ color: "var(--text-muted)" }}>Buffer Engine</span>
          <span style={{ color: "#F8B128", fontWeight: 600 }}>
            Aave Protocol (aUSDT) ✦ {aaveApy}% APY
          </span>
        </div>
      </div>

      {/* Gas-gated harvest status row — shows when farm adapter has gas params configured */}
      {(harvestGasEstimate != null || harvestGasMultiplier != null) && (
        <div
          style={{
            marginTop: 12,
            padding: "8px 10px",
            background: "rgba(74,222,128,.05)",
            borderRadius: 6,
            border: "1px solid rgba(74,222,128,.10)",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span
            style={{
              fontSize: 10,
              color: "#4ade80",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: ".04em",
            }}
          >
            Auto-Harvest
          </span>
          <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
            Gas-gated at{" "}
            {harvestGasEstimate != null
              ? harvestGasEstimate.toLocaleString()
              : "?"}{" "}
            gas × {harvestGasMultiplier ?? "?"}× multiplier
          </span>
        </div>
      )}
    </div>
  );
}
