import { getApiUrl } from "@/lib/api";
import {
  AlertCircle,
  ArrowDownToLine,
  Loader2,
  LockOpen,
  Pickaxe,
} from "lucide-react";
import { useState } from "react";
import { formatUnits, parseEther } from "viem";
import {
  useAccount,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";

export const TestnetTools = () => {
  const { address, isConnected } = useAccount();
  const { writeContract, isPending, data: hash } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });
  const [error, setError] = useState<string | null>(null);
  const [minting, setMinting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const tokenAddress = import.meta.env.VITE_TESTNET_TOKEN_ADDRESS;
  const vaultAddress = import.meta.env.VITE_TESTNET_VAULT_ADDRESS;
  const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:3001";

  const { data: balance } = useReadContract({
    address: tokenAddress,
    abi: [
      {
        name: "balanceOf",
        type: "function",
        stateMutability: "view",
        inputs: [{ type: "address", name: "account" }],
        outputs: [{ type: "uint256", name: "" }],
      },
    ],
    functionName: "balanceOf",
    args: [address],
    query: {
      enabled: !!address,
      refetchInterval: 2000,
    },
  });

  const formattedBalance = balance
    ? parseFloat(formatUnits(balance, 6)).toFixed(2)
    : "0.00";

  const handleMint = async () => {
    if (!address) {
      setError("Wallet not connected");
      return;
    }
    setError(null);
    setSuccess(null);
    setMinting(true);
    try {
      const response = await fetch(getApiUrl("/api/mcp"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: Date.now(),
          method: "tools/call",
          params: {
            name: "wdk_mint_test_token",
            arguments: {
              amount: "10000",
              recipient: address,
              context: "User minting test USDT via frontend testnet tools",
            },
          },
        }),
      });
      const data = await response.json();
      if (data.error) {
        setError(data.error.message || "Minting failed");
      } else if (data.result) {
        setError(null);
        setSuccess("✓ Successfully minted 10,000 USDT");
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Minting failed");
    }
    setMinting(false);
  };

  const handleApprove = () => {
    writeContract({
      address: tokenAddress,
      abi: [
        {
          name: "approve",
          type: "function",
          stateMutability: "nonpayable",
          inputs: [
            { type: "address", name: "spender" },
            { type: "uint256", name: "amount" },
          ],
          outputs: [{ type: "bool", name: "" }],
        },
      ],
      functionName: "approve",
      args: [vaultAddress, parseEther("1000")],
    });
  };

  const handleDeposit = () => {
    writeContract({
      address: vaultAddress,
      abi: [
        {
          name: "deposit",
          type: "function",
          stateMutability: "nonpayable",
          inputs: [
            { type: "uint256", name: "assets" },
            { type: "address", name: "receiver" },
          ],
          outputs: [{ type: "uint256", name: "" }],
        },
      ],
      functionName: "deposit",
      args: [parseEther("1000"), address],
    });
  };

  if (!isConnected) return null;

  const CyberButton = ({
    onClick,
    disabled,
    icon: Icon,
    label,
    colorClass,
    borderClass,
  }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`relative group overflow-hidden flex flex-col items-center justify-center p-3 rounded-xl bg-space-black/40 border border-white/10 hover:border-opacity-50 transition-all duration-300 w-full ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:shadow-[0_0_15px_rgba(38,161,123,0.15)]"}`}
    >
      <div
        className={`absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity duration-300 ${colorClass}`}
      ></div>
      <div
        className={`mb-1.5 p-1.5 rounded-lg bg-white/5 group-hover:bg-white/10 transition-colors border border-white/5 ${borderClass}`}
      >
        <Icon className="w-3.5 h-3.5 text-neutral-gray-light group-hover:text-white transition-colors" />
      </div>
      <span className="text-[9px] font-heading font-bold uppercase tracking-widest text-neutral-gray-light group-hover:text-tether-teal transition-colors">
        {label}
      </span>
      <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-white/10 group-hover:border-tether-teal/50 transition-colors"></div>
      <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-white/10 group-hover:border-tether-teal/50 transition-colors"></div>
    </button>
  );

  return (
    <div className="flex flex-col w-full mt-3 pt-3 border-t border-white/5">
      <div className="flex items-center justify-between px-1 mb-8">
        <span className="text-[9px] font-mono text-neutral-gray lowercase tracking-wide">
          Available Balance
        </span>
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-tether-teal/10 border border-tether-teal/20">
          <span className="w-1.5 h-1.5 rounded-full bg-tether-teal animate-pulse"></span>
          <span className="text-[10px] font-bold text-tether-teal font-mono">
            {formattedBalance} USD₮
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        <CyberButton
          onClick={handleMint}
          disabled={isPending || isConfirming || minting}
          icon={Pickaxe}
          label={minting ? "Minting..." : "Mint"}
          colorClass="bg-purple-500"
          borderClass="group-hover:border-purple-500/50"
        />
        <CyberButton
          onClick={handleApprove}
          disabled={isPending || isConfirming}
          icon={LockOpen}
          label="Approve"
          colorClass="bg-blue-500"
          borderClass="group-hover:border-blue-500/50"
        />
        <CyberButton
          onClick={handleDeposit}
          disabled={isPending || isConfirming}
          icon={ArrowDownToLine}
          label="Deposit"
          colorClass="bg-tether-teal"
          borderClass="group-hover:border-tether-teal/50"
        />
      </div>

      {(isPending || isConfirming || minting) && (
        <div className="flex items-center justify-center gap-2 text-[10px] text-tether-teal font-mono bg-tether-teal/5 py-1.5 rounded border border-tether-teal/10 mt-3">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span className="tracking-wider uppercase">Processing...</span>
        </div>
      )}

      {success && (
        <div className="flex items-center justify-center gap-2 text-[10px] text-green-400 font-mono bg-green-400/10 py-1.5 px-2 rounded border border-green-400/20 mt-3">
          <span className="tracking-wider">{success}</span>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-center gap-2 text-[10px] text-red-400 font-mono bg-red-400/10 py-1.5 px-2 rounded border border-red-400/20 mt-3">
          <AlertCircle className="w-3 h-3" />
          <span className="tracking-wider">{error}</span>
        </div>
      )}
    </div>
  );
};
