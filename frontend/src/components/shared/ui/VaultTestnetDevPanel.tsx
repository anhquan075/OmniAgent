import React, { useState, useCallback } from "react";
import { Radio, ExternalLink, Zap } from "lucide-react";

/// Format raw BigInt token amount to a human-readable string (2 decimal places).
/// Works without importing ethers at module level.
function fmtTokens(raw, dec) {
  if (raw == null || dec == null) return "—";
  const d = typeof dec === "bigint" ? Number(dec) : Number(dec);
  const divisor = 10n ** BigInt(d);
  const whole = raw / divisor;
  const frac = raw % divisor;
  const fracStr = frac.toString().padStart(d, "0").slice(0, 2);
  return `${Number(whole).toLocaleString()}.${fracStr}`;
}

/**
 * VaultTestnetDevPanel — shown only in testnet mode.
 *
 * Provides:
 *  - Testnet environment badge (visual indicator)
 *  - Live data row: TVL, cycle count, wallet mock-USDT balance
 *  - "Mint 10k USDT" button (calls MockERC20.mint — unrestricted on mock contract)
 *
 * Props:
 *   tokenAddress     — mock USDT contract address (testnet)
 *   signer           — ethers Signer (null if wallet not connected)
 *   walletAddress    — user wallet address string
 *   userTokenBalance — BigInt raw token balance
 *   decimals         — BigInt or number token decimals
 *   totalAssetsRaw   — BigInt raw vault total assets
 *   cycleCountVal    — number of executed cycles
 *   blockExplorer    — base URL for testnet block explorer
 *   onMinted         — callback fired after successful mint (triggers refresh)
 */
export function VaultTestnetDevPanel({
  tokenAddress,
  signer,
  walletAddress,
  userTokenBalance,
  decimals,
  totalAssetsRaw,
  cycleCountVal,
  blockExplorer,
  onMinted,
  networkLabel = "Sepolia",
  chainIdNum = 11155111,
}) {
  const [mintBusy, setMintBusy] = useState(false);
  const [mintMsg, setMintMsg] = useState(null);

  const handleMint = useCallback(async () => {
    if (!signer || !walletAddress) {
      setMintMsg("Connect wallet first");
      return;
    }
    setMintBusy(true);
    setMintMsg(null);
    try {
      const { Contract, getAddress, parseUnits } = await import("ethers");
      const mockToken = new Contract(
        getAddress(tokenAddress),
        ["function mint(address to, uint256 amount) external"],
        signer
      );
      const amount = parseUnits(
        "10000",
        decimals != null ? Number(decimals) : 18
      );
      const tx = await mockToken.mint(walletAddress, amount, {
        gasLimit: 100000,
      });
      await tx.wait();
      setMintMsg("Minted 10,000 mock USDT");
      if (onMinted) onMinted();
    } catch (e) {
      setMintMsg(e.shortMessage || e.message?.slice(0, 80) || "Mint failed");
    } finally {
      setMintBusy(false);
    }
  }, [signer, walletAddress, tokenAddress, decimals, onMinted]);

  const mintSuccess = mintMsg?.startsWith("Minted");

  return (
    <div
      style={{
        margin: "0 12px 6px",
        padding: "10px 16px",
        background: "rgba(234, 179, 8, 0.06)",
        border: "1px solid rgba(234, 179, 8, 0.25)",
        borderRadius: "8px",
        display: "flex",
        alignItems: "center",
        gap: "20px",
        flexWrap: "wrap",
        fontSize: "12px",
        fontFamily: "inherit",
      }}
    >
      {/* Testnet badge */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "7px",
          color: "#FBBF24",
          fontWeight: 700,
          letterSpacing: "0.03em",
        }}
      >
        <Radio size={14} />
        <span>TESTNET · {networkLabel} · Chain {chainIdNum}</span>
        <span style={{ color: "rgba(251,191,36,0.45)", fontWeight: 400 }}>
          — OmniAgent Smart Contracts
        </span>
      </div>

      {/* Live stats */}
      <div
        style={{
          display: "flex",
          gap: "18px",
          color: "rgba(251, 191, 36, 0.75)",
        }}
      >
        <span>
          TVL:{" "}
          <strong style={{ color: "#FBBF24" }}>
            {fmtTokens(totalAssetsRaw, decimals)}
          </strong>
        </span>
        <span>
          Cycles:{" "}
          <strong style={{ color: "#FBBF24" }}>{cycleCountVal ?? "—"}</strong>
        </span>
        <span>
          Wallet:{" "}
          <strong style={{ color: "#FBBF24" }}>
            {fmtTokens(userTokenBalance, decimals)} USDT
          </strong>
        </span>
      </div>

      {/* Mint button + explorer link */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          marginLeft: "auto",
        }}
      >
        {mintMsg && (
          <span
            style={{
              color: mintSuccess ? "#4ADE80" : "#F87171",
              fontSize: "11px",
              maxWidth: "200px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {mintMsg}
          </span>
        )}
        <button
          onClick={handleMint}
          disabled={mintBusy || !signer}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
            padding: "4px 14px",
            borderRadius: "6px",
            border: "1px solid rgba(234, 179, 8, 0.4)",
            background: mintBusy
              ? "rgba(234, 179, 8, 0.04)"
              : "rgba(234, 179, 8, 0.12)",
            color: "#FBBF24",
            fontSize: "12px",
            fontWeight: 600,
            fontFamily: "inherit",
            cursor: mintBusy || !signer ? "not-allowed" : "pointer",
            opacity: mintBusy || !signer ? 0.55 : 1,
            transition: "opacity 0.15s",
          }}
        >
          <Zap size={11} />
          {mintBusy ? "Minting…" : "Mint 10k USD₮"}
          {tokenAddress && blockExplorer && (
            <a
              href={`${blockExplorer}/address/${tokenAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              title="View Testnet USD₮ on Etherscan"
              onClick={(e) => e.stopPropagation()}
              style={{
                color: "rgba(251,191,36,0.5)",
                display: "inline-flex",
                alignItems: "center",
                marginLeft: "4px",
              }}
            >
              <ExternalLink size={10} />
            </a>
          )}
        </button>
      </div>
    </div>
  );
}

export default VaultTestnetDevPanel;
