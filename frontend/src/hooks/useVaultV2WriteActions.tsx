import { useCallback, useState } from "react";
import { engineV2Abi, erc20Abi, vaultV2Abi, pegArbAbi } from "@/lib/abi";
import { ZERO_ADDRESS as ZERO_ADDR } from "@/lib/constants";
const TX_HISTORY_STORAGE_KEY = "wdkvault:v2:tx-history";

function readPersistedTxHistory() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(TX_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, 8) : [];
  } catch {
    return [];
  }
}

function persistTxHistory(next) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(TX_HISTORY_STORAGE_KEY, JSON.stringify(next));
  } catch {}
}

function clearPersistedTxHistory() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(TX_HISTORY_STORAGE_KEY);
  } catch {}
}

function assertAddress(addr, label) {
  if (!addr || addr.trim() === ZERO_ADDR)
    throw new Error(
      `${label} not configured. Set the contract address in .env`
    );
}

function normalizeWriteError(error) {
  const raw = error?.shortMessage || error?.message || "Transaction failed";
  if (
    raw.includes("NotLocked") ||
    raw.includes("not locked") ||
    raw.includes("OmniAgentVault__NotLocked")
  ) {
    return "Deposits are blocked: vault configuration is not locked. An admin must call lockConfiguration() before deposits can be accepted.";
  }
  const missingRevert =
    raw.includes("missing revert data") ||
    raw.includes("reason=null") ||
    raw.includes("execution reverted (no data present)");
  if (error?.code === "CALL_EXCEPTION" && missingRevert) {
    return "Deposit rejected by contract. The vault or one of its adapters may not be fully configured. Contact the vault admin.";
  }
  return raw;
}

function decodeReasonSafe(ethersLib, maybeBytes32, fallback = "-") {
  if (!maybeBytes32) return fallback;
  try {
    return ethersLib.decodeBytes32String(maybeBytes32);
  } catch {
    return fallback;
  }
}

/// V2 write actions: deposit, withdraw, executeCycle with tx history
export function useVaultV2WriteActions({ refresh }) {
  const [txHistory, setTxHistory] = useState(readPersistedTxHistory);

  const appendTx = useCallback((action, hash, outcome, note) => {
    setTxHistory((prev) => {
      const next = [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          action,
          hash,
          outcome,
          note,
          at: new Date().toISOString(),
        },
        ...prev,
      ];
      const trimmed = next.slice(0, 8);
      persistTxHistory(trimmed);
      return trimmed;
    });
  }, []);

  const clearTxHistory = useCallback(() => {
    clearPersistedTxHistory();
    setTxHistory([]);
  }, []);

  const deposit = useCallback(
    async ({
      signer,
      vaultAddress,
      tokenAddress,
      depositAmount,
      decimals,
      setBusyAction,
      setStatus,
      refreshArgs,
    }) => {
      setBusyAction("deposit");
      try {
        const ethersLib = await import("ethers");
        if (!signer) throw new Error("Connect wallet first");
        assertAddress(vaultAddress, "Vault");

        const vault = new ethersLib.Contract(
          ethersLib.getAddress(vaultAddress.trim()),
          vaultV2Abi,
          signer
        );
        const signerAddress = await signer.getAddress();
        const vaultContractAddress = await vault.getAddress();

        const rawTokenAddr = tokenAddress
          ? tokenAddress.trim()
          : await vault.asset();
        const token = new ethersLib.Contract(
          ethersLib.getAddress(rawTokenAddr),
          erc20Abi,
          signer
        );
        const amount = ethersLib.parseUnits(depositAmount || "0", decimals);
        if (amount <= 0n) throw new Error("Invalid deposit amount");

        setStatus("Checking vault configuration...");
        const isLocked = await vault.configurationLocked().catch(() => null);
        if (isLocked === false) {
          throw new Error(
            "Deposits are blocked: vault configuration is not locked. An admin must call lockConfiguration() to enable deposits."
          );
        }

        const allowance = await token
          .allowance(signerAddress, vaultContractAddress)
          .catch(() => 0n);

        if (allowance < amount) {
          setStatus("Approving token...");
          if (allowance > 0n) {
            const resetTx = await token.approve(vaultContractAddress, 0n, {
              gasLimit: 60000,
            });
            await resetTx.wait();
          }
          const approveTx = await token.approve(vaultContractAddress, amount, {
            gasLimit: 100000,
          });
          await approveTx.wait();
        }

        setStatus("Simulating deposit...");
        try {
          await vault.deposit.staticCall(amount, signerAddress);
        } catch {
          throw new Error(
            "Deposit simulation failed. This vault deployment currently rejects deposits due to adapter/accounting configuration."
          );
        }

        setStatus("Depositing...");
        const tx = await vault.deposit(amount, signerAddress, {
          gasLimit: 1200000, // Sane limit for deposit + Venus park + harvest
        });
        await tx.wait();
        appendTx("Deposit", tx.hash, "success", "Deposit mined");
        await refresh(refreshArgs);
        setStatus("Deposit complete");
      } catch (error) {
        const msg = normalizeWriteError(error);
        appendTx("Deposit", null, "failed", msg);
        setStatus(msg);
      } finally {
        setBusyAction(null);
      }
    },
    [appendTx, refresh]
  );

  const withdraw = useCallback(
    async ({
      signer,
      vaultAddress,
      withdrawAmount,
      decimals,
      setBusyAction,
      setStatus,
      refreshArgs,
    }) => {
      setBusyAction("withdraw");
      try {
        const ethersLib = await import("ethers");
        if (!signer) throw new Error("Connect wallet first");
        assertAddress(vaultAddress, "Vault");

        const vault = new ethersLib.Contract(
          ethersLib.getAddress(vaultAddress.trim()),
          vaultV2Abi,
          signer
        );
        const amount = ethersLib.parseUnits(withdrawAmount || "0", decimals);
        if (amount <= 0n) throw new Error("Invalid withdraw amount");

        const userAddr = await signer.getAddress();
        const maxW = await vault.maxWithdraw(userAddr).catch(() => 0n);
        if (amount > maxW) {
          const fmtMax = ethersLib.formatUnits(maxW, decimals);
          throw new Error(
            maxW === 0n
              ? "Nothing to withdraw — vault has no liquid assets available (maxWithdraw = 0). You may need to wait for a rebalance cycle or the vault may have no deposited funds."
              : `Amount exceeds max withdrawable. Max: ${fmtMax} tokens.`
          );
        }

        setStatus("Withdrawing...");
        const tx = await vault.withdraw(amount, userAddr, userAddr, {
          gasLimit: 1200000, // Sane limit for potential Venus redemption + stack
        });
        await tx.wait();
        appendTx("Withdraw", tx.hash, "success", "Withdraw mined");
        await refresh(refreshArgs);
        setStatus("Withdraw complete");
      } catch (error) {
        const msg =
          error.code === "CALL_EXCEPTION" &&
          error.data?.startsWith("0xfe9cceec")
            ? "Withdraw rejected: vault maxWithdraw is 0. No liquid assets available to redeem."
            : error.message;
        appendTx("Withdraw", null, "failed", msg);
        setStatus(msg);
      } finally {
        setBusyAction(null);
      }
    },
    [appendTx, refresh]
  );

  const executeCycle = useCallback(
    async ({
      signer,
      engineAddress,
      circuitBreakerAddress,
      canExecute,
      canExecuteReason,
      setBusyAction,
      setStatus,
      refreshArgs,
    }) => {
      setBusyAction("execute");
      try {
        const ethersLib = await import("ethers");
        if (!signer) throw new Error("Connect wallet first");
        assertAddress(engineAddress, "Engine");

        if (canExecute === false) {
          throw new Error(`Cannot execute: ${canExecuteReason || "not ready"}`);
        }

        const engine = new ethersLib.Contract(
          ethersLib.getAddress(engineAddress.trim()),
          engineV2Abi,
          signer
        );

        const [[ok, reasonBytes32], breakerPreview, decisionPreview] =
          await Promise.all([
            engine.canExecute(),
            engine.previewBreaker().catch(() => null),
            engine.previewDecision().catch(() => null),
          ]);

        const breaker = breakerPreview?.status ?? breakerPreview;
        const decision = decisionPreview?.preview ?? decisionPreview;
        const activeSignals = [
          breaker?.signalA ? "A" : null,
          breaker?.signalB ? "B" : null,
          breaker?.signalC ? "C" : null,
        ]
          .filter(Boolean)
          .join(", ");
        if (breaker?.paused || activeSignals) {
          const signalText = activeSignals
            ? ` (signals: ${activeSignals})`
            : "";
          throw new Error(
            `Circuit breaker paused${signalText}. Wait for recovery or signal normalization.`
          );
        }

        if (decision && decision.executable === false) {
          const decisionReason = decodeReasonSafe(
            ethersLib,
            decision.reason,
            canExecuteReason || "not ready"
          );
          throw new Error(`Execution rejected by algorithm: ${decisionReason}`);
        }

        if (!ok) {
          const reason = decodeReasonSafe(
            ethersLib,
            reasonBytes32,
            canExecuteReason || "not ready"
          );
          throw new Error(`Not ready: ${reason}`);
        }

        await engine.executeCycle.staticCall();

        setStatus("Executing cycle...");
        const tx = await engine.executeCycle({
          gasLimit: 5000000, // Full rebalance is heavy (swaps + many transfers)
        });
        await tx.wait();
        appendTx(
          "Execute Cycle",
          tx.hash,
          "success",
          "Cycle execution confirmed"
        );
        await refresh(refreshArgs);
        setStatus("Cycle executed");
      } catch (error) {
        let msg = error.message;
        if (error.code === "CALL_EXCEPTION") {
          try {
            const ethersLib = await import("ethers");
            const engine = new ethersLib.Contract(
              ethersLib.getAddress(engineAddress.trim()),
              engineV2Abi,
              signer
            );
            const [breakerPreview, decisionPreview, canExec] =
              await Promise.all([
                engine.previewBreaker().catch(() => null),
                engine.previewDecision().catch(() => null),
                engine.canExecute().catch(() => null),
              ]);
            const breaker = breakerPreview?.status ?? breakerPreview;
            const decision = decisionPreview?.preview ?? decisionPreview;
            const activeSignals = [
              breaker?.signalA ? "A" : null,
              breaker?.signalB ? "B" : null,
              breaker?.signalC ? "C" : null,
            ]
              .filter(Boolean)
              .join(", ");
            if (breaker?.paused || activeSignals) {
              msg = `Circuit breaker paused${
                activeSignals ? ` (signals: ${activeSignals})` : ""
              }.`;
            } else if (decision && decision.executable === false) {
              msg = `Execution rejected by algorithm: ${decodeReasonSafe(
                ethersLib,
                decision.reason,
                "not ready"
              )}`;
            } else if (canExec && canExec[0] === false) {
              msg = `Not ready: ${decodeReasonSafe(
                ethersLib,
                canExec[1],
                "not ready"
              )}`;
            } else if (canExec && canExec[0] === true) {
              // canExecute=READY but staticCall reverted — decode the actual revert reason
              msg =
                "Execution simulation reverted (canExecute=READY). DEX router may need re-seeding.";
              try {
                // Try to extract the revert reason from the original staticCall error
                const revertData = error?.data ?? error?.error?.data ?? null;
                if (revertData && revertData !== "0x") {
                  try {
                    // Try standard Error(string) decode
                    const decoded = ethersLib.AbiCoder.defaultAbiCoder().decode(
                      ["string"],
                      "0x" + revertData.slice(10)
                    );
                    msg = `Execution reverted: "${decoded[0]}"`;
                  } catch {
                    // Try custom error selector lookup (first 4 bytes)
                    const selector = revertData.slice(0, 10);
                    msg = `Execution reverted with custom error selector ${selector}. Check adapter state or re-seed DEX router reserves.`;
                  }
                } else {
                  // No revert data — silent revert (out-of-gas, adapter call failure, or cooldown)
                  const probeEngine = new ethersLib.Contract(
                    ethersLib.getAddress(engineAddress.trim()),
                    ["function vault() view returns(address)"],
                    signer
                  );
                  const vaultAddr = await probeEngine.vault().catch(() => null);
                  if (vaultAddr) {
                    const totalAssets = await new ethersLib.Contract(
                      ethersLib.getAddress(vaultAddr),
                      ["function totalAssets() view returns(uint256)"],
                      signer
                    )
                      .totalAssets()
                      .catch(() => 0n);
                    msg =
                      totalAssets === 0n
                        ? "Execution reverted: vault has no assets. Deposit funds first, then execute."
                        : "Execution reverted (no revert data). On testnet: run re-seed script for DEX router reserves. On mainnet: check circuit breaker status or wait for cycle cooldown to elapse.";
                  }
                }
              } catch {
                msg =
                  "Execution reverted at runtime. Check circuit breaker status and cycle cooldown, then retry.";
              }
            } else {
              msg =
                "Execution rejected. Check breaker status and algorithm decision.";
            }

            if (
              msg.includes("Check breaker status") &&
              circuitBreakerAddress &&
              circuitBreakerAddress !== ZERO_ADDR
            ) {
              try {
                const breaker = new ethersLib.Contract(
                  ethersLib.getAddress(circuitBreakerAddress.trim()),
                  [
                    "function isPaused() view returns (bool)",
                    "function previewBreaker() view returns (tuple(bool paused,bool signalA,bool signalB,bool signalC,uint256 lastTripTimestamp,uint256 recoveryTimestamp) status)",
                  ],
                  signer
                );
                const [paused, preview] = await Promise.all([
                  breaker.isPaused().catch(() => null),
                  breaker.previewBreaker().catch(() => null),
                ]);
                const s = preview?.status ?? preview;
                const activeSignals = [
                  s?.signalA ? "A" : null,
                  s?.signalB ? "B" : null,
                  s?.signalC ? "C" : null,
                ]
                  .filter(Boolean)
                  .join(", ");
                if (paused === true || s?.paused === true) {
                  msg = `Circuit breaker paused${
                    activeSignals ? ` (signals: ${activeSignals})` : ""
                  }.`;
                }
              } catch {}
            }
          } catch {
            msg =
              "Execution rejected. Check breaker status and algorithm decision.";
          }
        }
        appendTx("Execute Cycle", null, "failed", msg);
        setStatus(msg);
      } finally {
        setBusyAction(null);
      }
    },
    [appendTx, refresh]
  );

  const executeArbitrage = useCallback(
    async ({
      signer,
      pegArbExecutorAddress,
      setBusyAction,
      setStatus,
      refreshArgs,
    }) => {
      setBusyAction("arb");
      try {
        const ethersLib = await import("ethers");
        if (!signer) throw new Error("Connect wallet first");
        assertAddress(pegArbExecutorAddress, "PegArbExecutor");

        const pegArb = new ethersLib.Contract(
          ethersLib.getAddress(pegArbExecutorAddress.trim()),
          pegArbAbi,
          signer
        );

        setStatus("Executing arbitrage...");
        const tx = await pegArb.executeArb({
          gasLimit: 1000000, // Sane limit for PegArb swaps
        });
        await tx.wait();
        appendTx("Execute Arb", tx.hash, "success", "Arbitrage executed");
        await refresh(refreshArgs);
        setStatus("Arbitrage complete");
      } catch (error) {
        const msg =
          error.code === "CALL_EXCEPTION"
            ? "Arbitrage execution failed. No profitable opportunity or slippage exceeded."
            : error.message;
        appendTx("Execute Arb", null, "failed", msg);
        setStatus(msg);
      } finally {
        setBusyAction(null);
      }
    },
    [appendTx, refresh]
  );

  return {
    txHistory,
    clearTxHistory,
    deposit,
    withdraw,
    executeCycle,
    executeArbitrage,
  };
}
