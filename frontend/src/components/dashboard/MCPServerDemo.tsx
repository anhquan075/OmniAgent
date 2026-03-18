import { getApiUrl } from "@/lib/api";
import {
  BotIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CoinsIcon,
  CopyCheckIcon,
  CopyIcon,
  LayersIcon,
  Loader2Icon,
  WalletIcon,
  XIcon,
  ZapIcon,
} from "lucide-react";
import React, { useEffect, useState } from "react";
import { useAccount } from "wagmi";

interface MCPTool {
  name: string;
  description: string;
  riskLevel: "low" | "medium" | "high";
  blockchain: string;
  category: string;
  params?: { name: string; placeholder: string; required: boolean }[];
}

const WDK_COLOR = "#2DD4BF";
const X402_COLOR = "#F59E0B";
const ERC4337_COLOR = "#6366F1";

const RISK_CONFIG = {
  low: {
    label: "LOW",
    color: "#22C55E",
    bg: "bg-green-500/10",
    border: "border-green-500/20",
  },
  medium: {
    label: "MED",
    color: "#EAB308",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/20",
  },
  high: {
    label: "HIGH",
    color: "#EF4444",
    bg: "bg-red-500/10",
    border: "border-red-500/20",
  },
};

const ERC4337_ICON = (props: React.ComponentProps<"svg">) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <rect x="3" y="11" width="18" height="10" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    <circle cx="12" cy="16" r="1" />
  </svg>
);

const toolCategories: {
  id: string;
  name: string;
  icon: any;
  color: string;
  tools: MCPTool[];
}[] = [
  {
    id: "bnb",
    name: "BNB Chain",
    icon: ZapIcon,
    color: "#F3BA2F",
    tools: [
      {
        name: "bnb_createWallet",
        description: "Create wallet",
        riskLevel: "low",
        blockchain: "bnb",
        category: "wallet",
        params: [
          {
            name: "walletIndex",
            placeholder: "Wallet index (optional)",
            required: false,
          },
        ],
      },
      {
        name: "bnb_getBalance",
        description: "Get balance",
        riskLevel: "low",
        blockchain: "bnb",
        category: "wallet",
        params: [
          {
            name: "address",
            placeholder: "Address (optional)",
            required: false,
          },
          {
            name: "tokenAddress",
            placeholder: "Token address (optional)",
            required: false,
          },
        ],
      },
      {
        name: "bnb_transfer",
        description: "Transfer BNB/USDT",
        riskLevel: "medium",
        blockchain: "bnb",
        category: "transfer",
        params: [
          { name: "to", placeholder: "Recipient address", required: true },
          { name: "amount", placeholder: "Amount", required: true },
          {
            name: "token",
            placeholder: "token (usdt/native)",
            required: false,
          },
        ],
      },
      {
        name: "bnb_swap",
        description: "Swap tokens",
        riskLevel: "medium",
        blockchain: "bnb",
        category: "defi",
        params: [
          { name: "amountIn", placeholder: "Amount in", required: true },
          { name: "tokenIn", placeholder: "Token in", required: true },
          { name: "tokenOut", placeholder: "Token out", required: true },
        ],
      },
      {
        name: "bnb_supplyAave",
        description: "Supply to Aave",
        riskLevel: "medium",
        blockchain: "bnb",
        category: "lending",
        params: [
          {
            name: "amount",
            placeholder: "Amount (e.g., 1000)",
            required: true,
          },
        ],
      },
      {
        name: "bnb_withdrawAave",
        description: "Withdraw from Aave",
        riskLevel: "medium",
        blockchain: "bnb",
        category: "lending",
        params: [
          { name: "amount", placeholder: "Amount (e.g., 500)", required: true },
        ],
      },
      {
        name: "bnb_bridgeLayerZero",
        description: "Bridge via LayerZero",
        riskLevel: "high",
        blockchain: "bnb",
        category: "bridge",
        params: [
          { name: "amount", placeholder: "Amount", required: true },
          {
            name: "dstEid",
            placeholder: "Destination chain ID",
            required: true,
          },
          {
            name: "recipientAddress",
            placeholder: "Recipient (optional)",
            required: false,
          },
        ],
      },
    ],
  },
  {
    id: "solana",
    name: "Solana",
    icon: ZapIcon,
    color: "#14F195",
    tools: [
      {
        name: "sol_createWallet",
        description: "Create Solana wallet",
        riskLevel: "low",
        blockchain: "sol",
        category: "wallet",
        params: [
          {
            name: "walletIndex",
            placeholder: "Wallet index (optional)",
            required: false,
          },
        ],
      },
      {
        name: "sol_getBalance",
        description: "Get SOL balance",
        riskLevel: "low",
        blockchain: "sol",
        category: "wallet",
        params: [
          {
            name: "address",
            placeholder: "Address (optional)",
            required: false,
          },
          {
            name: "tokenAddress",
            placeholder: "Token address (optional)",
            required: false,
          },
        ],
      },
      {
        name: "sol_transfer",
        description: "Transfer SOL/tokens",
        riskLevel: "medium",
        blockchain: "sol",
        category: "transfer",
        params: [
          { name: "to", placeholder: "Recipient address", required: true },
          { name: "amount", placeholder: "Amount", required: true },
          {
            name: "tokenAddress",
            placeholder: "Token address (optional)",
            required: false,
          },
        ],
      },
      {
        name: "sol_swap",
        description: "Swap tokens on Solana",
        riskLevel: "medium",
        blockchain: "sol",
        category: "defi",
        params: [
          { name: "amountIn", placeholder: "Amount in", required: true },
          { name: "tokenIn", placeholder: "Token in", required: true },
          { name: "tokenOut", placeholder: "Token out", required: true },
          {
            name: "slippageBps",
            placeholder: "Slippage bps (optional)",
            required: false,
          },
        ],
      },
    ],
  },
  {
    id: "ton",
    name: "TON",
    icon: ZapIcon,
    color: "#0098EA",
    tools: [
      {
        name: "ton_createWallet",
        description: "Create TON wallet",
        riskLevel: "low",
        blockchain: "ton",
        category: "wallet",
        params: [
          {
            name: "walletIndex",
            placeholder: "Wallet index (optional)",
            required: false,
          },
        ],
      },
      {
        name: "ton_getBalance",
        description: "Get TON balance",
        riskLevel: "low",
        blockchain: "ton",
        category: "wallet",
        params: [
          {
            name: "address",
            placeholder: "Address (optional)",
            required: false,
          },
          {
            name: "jettonAddress",
            placeholder: "Jetton address (optional)",
            required: false,
          },
        ],
      },
      {
        name: "ton_transfer",
        description: "Transfer TON/jettons",
        riskLevel: "medium",
        blockchain: "ton",
        category: "transfer",
        params: [
          { name: "to", placeholder: "Recipient address", required: true },
          { name: "amount", placeholder: "Amount", required: true },
          {
            name: "jettonAddress",
            placeholder: "Jetton address (optional)",
            required: false,
          },
          {
            name: "comment",
            placeholder: "Comment (optional)",
            required: false,
          },
        ],
      },
    ],
  },
  {
    id: "x402",
    name: "X402 Robot Economy",
    icon: BotIcon,
    color: X402_COLOR,
    tools: [
      {
        name: "x402_list_services",
        description: "List hireable sub-agents",
        riskLevel: "low",
        blockchain: "bnb",
        category: "x402",
      },
      {
        name: "x402_pay_subagent",
        description: "Pay sub-agent for task",
        riskLevel: "medium",
        blockchain: "bnb",
        category: "x402",
        params: [
          {
            name: "providerAddress",
            placeholder: "Agent wallet address",
            required: true,
          },
          {
            name: "amount",
            placeholder: "Amount USDT (e.g., 0.1)",
            required: true,
          },
          { name: "serviceType", placeholder: "Service type", required: true },
        ],
      },
      {
        name: "x402_get_balance",
        description: "Get USDT balance for payments",
        riskLevel: "low",
        blockchain: "bnb",
        category: "x402",
        params: [
          {
            name: "address",
            placeholder: "Address (optional)",
            required: false,
          },
        ],
      },
      {
        name: "x402_fleet_status",
        description: "Robot fleet status",
        riskLevel: "low",
        blockchain: "bnb",
        category: "x402",
      },
    ],
  },
  {
    id: "vault",
    name: "WDK Vault",
    icon: LayersIcon,
    color: "#8B5CF6",
    tools: [
      {
        name: "wdk_mint_test_token",
        description: "Mint test USDT (1000 default)",
        riskLevel: "medium",
        blockchain: "bnb",
        category: "defi",
        params: [
          {
            name: "amount",
            placeholder: "Amount (e.g., 1000)",
            required: true,
          },
          {
            name: "recipient",
            placeholder: "Recipient address (optional)",
            required: false,
          },
        ],
      },
      {
        name: "wdk_vault_deposit",
        description: "Deposit USDT to vault",
        riskLevel: "medium",
        blockchain: "bnb",
        category: "defi",
        params: [
          {
            name: "amount",
            placeholder: "Amount (e.g., 1000)",
            required: true,
          },
        ],
      },
      {
        name: "wdk_vault_withdraw",
        description: "Withdraw USDT from vault",
        riskLevel: "medium",
        blockchain: "bnb",
        category: "defi",
        params: [
          { name: "amount", placeholder: "Amount (e.g., 500)", required: true },
        ],
      },
      {
        name: "wdk_vault_getBalance",
        description: "Get vault balance",
        riskLevel: "low",
        blockchain: "bnb",
        category: "defi",
        params: [
          {
            name: "account",
            placeholder: "Account address (optional)",
            required: false,
          },
        ],
      },
      {
        name: "wdk_vault_getState",
        description: "Get vault state",
        riskLevel: "low",
        blockchain: "bnb",
        category: "defi",
      },
    ],
  },
  {
    id: "engine",
    name: "WDK Engine",
    icon: ZapIcon,
    color: "#EC4899",
    tools: [
      {
        name: "wdk_engine_executeCycle",
        description: "Execute yield cycle",
        riskLevel: "high",
        blockchain: "bnb",
        category: "defi",
      },
      {
        name: "wdk_engine_getCycleState",
        description: "Get cycle state",
        riskLevel: "low",
        blockchain: "bnb",
        category: "defi",
      },
      {
        name: "wdk_engine_getRiskMetrics",
        description: "Get risk metrics",
        riskLevel: "low",
        blockchain: "bnb",
        category: "defi",
      },
    ],
  },
  {
    id: "aave",
    name: "Aave Lending",
    icon: CoinsIcon,
    color: "#10B981",
    tools: [
      {
        name: "wdk_aave_supply",
        description: "Supply USDT to Aave",
        riskLevel: "medium",
        blockchain: "bnb",
        category: "lending",
        params: [
          {
            name: "amount",
            placeholder: "Amount (e.g., 1000)",
            required: true,
          },
        ],
      },
      {
        name: "wdk_aave_withdraw",
        description: "Withdraw from Aave",
        riskLevel: "medium",
        blockchain: "bnb",
        category: "lending",
        params: [
          { name: "amount", placeholder: "Amount (e.g., 500)", required: true },
        ],
      },
      {
        name: "wdk_aave_getPosition",
        description: "Get Aave position",
        riskLevel: "low",
        blockchain: "bnb",
        category: "lending",
        params: [{ name: "user", placeholder: "User address", required: true }],
      },
    ],
  },
  {
    id: "erc4337",
    name: "ERC-4337 Accounts",
    icon: ERC4337_ICON,
    color: ERC4337_COLOR,
    tools: [
      {
        name: "erc4337_createAccount",
        description: "Create smart account",
        riskLevel: "medium",
        blockchain: "bnb",
        category: "account-abstraction",
        params: [
          { name: "owner", placeholder: "Owner EOA address", required: true },
        ],
      },
      {
        name: "erc4337_getAccountAddress",
        description: "Predict account address",
        riskLevel: "low",
        blockchain: "bnb",
        category: "account-abstraction",
        params: [
          { name: "owner", placeholder: "Owner EOA address", required: true },
        ],
      },
      {
        name: "erc4337_isValidAccount",
        description: "Check valid account",
        riskLevel: "low",
        blockchain: "bnb",
        category: "account-abstraction",
        params: [
          { name: "account", placeholder: "Account address", required: true },
        ],
      },
      {
        name: "erc4337_execute",
        description: "Execute transaction",
        riskLevel: "high",
        blockchain: "bnb",
        category: "account-abstraction",
        params: [
          { name: "account", placeholder: "Smart account", required: true },
          { name: "dest", placeholder: "Destination", required: true },
          { name: "value", placeholder: "Value (wei)", required: false },
          { name: "data", placeholder: "Calldata (hex)", required: false },
        ],
      },
      {
        name: "erc4337_getBalance",
        description: "Get account balance",
        riskLevel: "low",
        blockchain: "bnb",
        category: "account-abstraction",
        params: [
          { name: "account", placeholder: "Account address", required: true },
        ],
      },
      {
        name: "erc4337_addDeposit",
        description: "Add gas deposit",
        riskLevel: "medium",
        blockchain: "bnb",
        category: "account-abstraction",
        params: [
          { name: "account", placeholder: "Smart account", required: true },
          { name: "amount", placeholder: "Amount (wei)", required: true },
        ],
      },
      {
        name: "erc4337_withdrawNative",
        description: "Withdraw native tokens",
        riskLevel: "high",
        blockchain: "bnb",
        category: "account-abstraction",
        params: [
          { name: "account", placeholder: "Smart account", required: true },
          { name: "to", placeholder: "Recipient", required: true },
          { name: "amount", placeholder: "Amount (wei)", required: true },
        ],
      },
      {
        name: "erc4337_setTokenApproval",
        description: "Set paymaster token",
        riskLevel: "high",
        blockchain: "bnb",
        category: "account-abstraction",
        params: [
          { name: "token", placeholder: "Token address", required: true },
          { name: "approved", placeholder: "true/false", required: true },
          { name: "rate", placeholder: "Rate (8 decimals)", required: false },
        ],
      },
      {
        name: "erc4337_executeBatch",
        description: "Execute batch transactions",
        riskLevel: "high",
        blockchain: "bnb",
        category: "account-abstraction",
        params: [
          { name: "account", placeholder: "Smart account", required: true },
          {
            name: "dests",
            placeholder: "Destination addresses (comma-separated)",
            required: true,
          },
          {
            name: "values",
            placeholder: "Values in wei (comma-separated, optional)",
            required: false,
          },
          {
            name: "datas",
            placeholder: "Calldatas (comma-separated, optional)",
            required: false,
          },
        ],
      },
      {
        name: "erc4337_withdrawToken",
        description: "Withdraw tokens",
        riskLevel: "high",
        blockchain: "bnb",
        category: "account-abstraction",
        params: [
          { name: "account", placeholder: "Smart account", required: true },
          { name: "token", placeholder: "Token address", required: true },
          { name: "to", placeholder: "Recipient", required: true },
          { name: "amount", placeholder: "Amount", required: true },
        ],
      },
      {
        name: "erc4337_isTokenApproved",
        description: "Check token approval",
        riskLevel: "low",
        blockchain: "bnb",
        category: "account-abstraction",
        params: [
          { name: "token", placeholder: "Token address", required: true },
        ],
      },
      {
        name: "erc4337_getDeposit",
        description: "Get account deposit",
        riskLevel: "low",
        blockchain: "bnb",
        category: "account-abstraction",
        params: [
          { name: "account", placeholder: "Account address", required: true },
        ],
      },
    ],
  },
  {
    id: "bridge",
    name: "Cross-Chain Bridge",
    icon: LayersIcon,
    color: "#3B82F6",
    tools: [
      {
        name: "wdk_bridge_bridge",
        description: "Bridge USDT via LayerZero",
        riskLevel: "high",
        blockchain: "bnb",
        category: "bridge",
        params: [
          { name: "amount", placeholder: "Amount", required: true },
          {
            name: "dstEid",
            placeholder: "Destination chain ID",
            required: true,
          },
          {
            name: "recipientAddress",
            placeholder: "Recipient (optional)",
            required: false,
          },
        ],
      },
      {
        name: "wdk_bridge_getStatus",
        description: "Get bridge quote",
        riskLevel: "low",
        blockchain: "bnb",
        category: "bridge",
        params: [
          { name: "amount", placeholder: "Amount", required: true },
          {
            name: "dstEid",
            placeholder: "Destination chain ID",
            required: true,
          },
        ],
      },
    ],
  },
];

interface MCPServerDemoProps {
  isExpanded?: boolean;
  onToggleExpand?: (expanded: boolean) => void;
}

export default function MCPServerDemo({
  isExpanded: externalIsExpanded,
  onToggleExpand,
}: MCPServerDemoProps) {
  const { address, isConnected } = useAccount();
  const [internalExpanded, setInternalExpanded] = useState(true);
  const isExpanded =
    externalIsExpanded !== undefined ? externalIsExpanded : internalExpanded;
  const setIsExpanded = (value: boolean) => {
    if (onToggleExpand) {
      onToggleExpand(value);
    } else {
      setInternalExpanded(value);
    }
  };
  const [serverStatus, setServerStatus] = useState<
    "connecting" | "connected" | "disconnected"
  >("connecting");
  const [testResult, setTestResult] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [testingTool, setTestingTool] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [toolArgs, setToolArgs] = useState<Record<string, string>>({});
  const [showArgs, setShowArgs] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<string[]>([
    "x402",
  ]);

  useEffect(() => {
    const timer = setTimeout(() => setServerStatus("connected"), 1500);
    return () => clearTimeout(timer);
  }, []);

  const toggleCategory = (catId: string) => {
    setExpandedCategories((prev) =>
      prev.includes(catId)
        ? prev.filter((id) => id !== catId)
        : [...prev, catId],
    );
  };

  const testTool = async (toolName: string) => {
    setIsTesting(true);
    setTestingTool(toolName);
    setTestResult(null);

    try {
      let tool: MCPTool | undefined;
      for (const cat of toolCategories) {
        tool = cat.tools.find((t) => t.name === toolName);
        if (tool) break;
      }

      const args: Record<string, unknown> = {};

      if (tool?.params) {
        for (const param of tool.params) {
          const value = toolArgs[`${toolName}_${param.name}`] || "";
          if (param.required && !value) {
            setTestResult(`Error: ${param.name} is required`);
            setIsTesting(false);
            setTestingTool(null);
            return;
          }
          if (value) {
            args[param.name] = value;
          }
        }
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (address) headers["x-user-wallet"] = address;
      if (isConnected) headers["x-wallet-connected"] = "true";

      const response = await fetch(getApiUrl("/api/mcp"), {
        method: "POST",
        headers,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: Date.now(),
          method: "tools/call",
          params: { name: toolName, arguments: args },
        }),
      });
      const data = await response.json();
      setTestResult(JSON.stringify(data, null, 2));
    } catch (error) {
      setTestResult(
        `Error: ${error instanceof Error ? error.message : "Connection failed"}`,
      );
    } finally {
      setIsTesting(false);
      setTestingTool(null);
    }
  };

  const formatTestResult = (data: any): string => {
    try {
      if (data?.result?.content?.[0]?.text) {
        const textContent = data.result.content[0].text;

        try {
          const parsedText = JSON.parse(textContent);

          return JSON.stringify(
            {
              ...data,
              result: {
                ...data.result,
                content: [
                  {
                    ...data.result.content[0],
                    text: parsedText,
                  },
                ],
              },
            },
            null,
            2,
          );
        } catch {
          return JSON.stringify(data, null, 2);
        }
      }

      return JSON.stringify(data, null, 2);
    } catch {
      return JSON.stringify(data, null, 2);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const totalTools = toolCategories.reduce(
    (sum, cat) => sum + cat.tools.length,
    0,
  );

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${serverStatus === "connected" ? "bg-green-400 shadow-[0_0_8px_rgba(34,197,94,0.5)]" : serverStatus === "connecting" ? "bg-yellow-400 animate-pulse" : "bg-red-400"}`}
            />
            <span
              className={`text-[10px] font-mono uppercase tracking-wider ${serverStatus === "connected" ? "text-green-400" : serverStatus === "connecting" ? "text-yellow-400" : "text-red-400"}`}
            ></span>
          </div>
          <span className="text-[10px] text-neutral-gray">
            {totalTools} tools
          </span>
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-1.5 text-[10px] text-neutral-gray hover:text-white transition-colors cursor-pointer"
        >
          {isExpanded ? (
            <ChevronDownIcon className="w-3.5 h-3.5" />
          ) : (
            <ChevronRightIcon className="w-3.5 h-3.5" />
          )}
          <span className="uppercase tracking-wider">
            {isExpanded ? "Collapse" : "Expand"}
          </span>
        </button>
      </div>
      {isExpanded && (
        <>
          <div className="flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/10">
            <div className="flex items-center gap-2">
              <WalletIcon className="w-4 h-4 text-tether-teal" />
              <div className="flex flex-col">
                <span className="text-[10px] text-white font-medium">
                  {isConnected && address
                    ? `${address.slice(0, 6)}...${address.slice(-4)}`
                    : "No wallet connected"}
                </span>
                <span className="text-[8px] text-neutral-gray">
                  {isConnected ? "Connected" : "Using agent wallet"}
                </span>
              </div>
            </div>
            <div
              className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-400" : "bg-yellow-400"}`}
            />
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 -mr-1">
            <div className="grid grid-cols-1 gap-2">
              {toolCategories.map((category) => {
                const Icon = category.icon;
                const isExpandedCat = expandedCategories.includes(category.id);

                return (
                  <div
                    key={category.id}
                    className="rounded-lg bg-white/[0.02] border border-white/[0.06] overflow-hidden"
                  >
                    <button
                      onClick={() => toggleCategory(category.id)}
                      className="w-full flex items-center gap-2 p-2.5 hover:bg-white/[0.03] transition-colors cursor-pointer"
                    >
                      <Icon
                        className="w-4 h-4"
                        style={{ color: category.color }}
                      />
                      <span className="text-[11px] font-medium text-white flex-1 text-left">
                        {category.name}
                      </span>
                      <span className="text-[9px] text-white/30">
                        {category.tools.length}
                      </span>
                      {isExpandedCat ? (
                        <ChevronDownIcon className="w-3 h-3 text-white/30" />
                      ) : (
                        <ChevronRightIcon className="w-3 h-3 text-white/30" />
                      )}
                    </button>

                    {isExpandedCat && (
                      <div className="border-t border-white/5">
                        {category.tools.map((tool) => {
                          const risk = RISK_CONFIG[tool.riskLevel];
                          const isThisTesting = testingTool === tool.name;
                          const showArgsForTool = showArgs === tool.name;

                          return (
                            <div
                              key={tool.name}
                              className="p-2.5 border-b border-white/5 last:border-b-0 hover:bg-white/[0.02] transition-all"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span
                                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                      style={{
                                        backgroundColor: category.color,
                                        boxShadow: `0 0 6px ${category.color}40`,
                                      }}
                                    />
                                    <span className="text-[10px] font-mono text-white/90 truncate">
                                      {tool.name}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 mt-1">
                                    <span
                                      className={`text-[8px] font-mono px-1.5 py-0.5 rounded ${risk.bg} ${risk.border} border`}
                                      style={{ color: risk.color }}
                                    >
                                      {risk.label}
                                    </span>
                                    <span className="text-[8px] text-white/30">
                                      {tool.description}
                                    </span>
                                  </div>
                                </div>
                                <button
                                  onClick={() => {
                                    // Smart ZapIcon: Direct execute for parameterless tools, show form for others
                                    if (
                                      !tool.params ||
                                      tool.params.length === 0
                                    ) {
                                      testTool(tool.name);
                                    } else {
                                      setShowArgs(
                                        showArgsForTool ? null : tool.name,
                                      );
                                    }
                                  }}
                                  className="p-1.5 rounded-md bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all cursor-pointer"
                                >
                                  {isThisTesting ? (
                                    <Loader2Icon className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <ZapIcon className="w-3 h-3" />
                                  )}
                                </button>
                              </div>

                              {showArgsForTool &&
                                tool.params &&
                                tool.params.length > 0 && (
                                  <div className="mt-2 pt-2 border-t border-white/10">
                                    <div className="grid grid-cols-1 gap-2">
                                      {tool.params.map((param) => (
                                        <input
                                          key={param.name}
                                          type="text"
                                          placeholder={param.placeholder}
                                          value={
                                            toolArgs[
                                              `${tool.name}_${param.name}`
                                            ] || ""
                                          }
                                          onChange={(e) =>
                                            setToolArgs((prev) => ({
                                              ...prev,
                                              [`${tool.name}_${param.name}`]:
                                                e.target.value,
                                            }))
                                          }
                                          className="w-full px-2 py-1.5 text-[10px] font-mono bg-black/30 border border-white/10 rounded text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none"
                                        />
                                      ))}
                                      <button
                                        onClick={() => testTool(tool.name)}
                                        disabled={isTesting}
                                        className="px-3 py-1.5 text-[10px] font-medium bg-white/10 hover:bg-white/20 text-white rounded border border-white/20 cursor-pointer disabled:opacity-50"
                                      >
                                        Execute
                                      </button>
                                    </div>
                                  </div>
                                )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {testResult && (
            <div className="p-2.5 rounded-lg bg-black/60 border border-white/10">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] text-neutral-gray font-mono">
                  Response
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => copyToClipboard(testResult)}
                    className="p-1 rounded hover:bg-white/10 text-white/40 hover:text-white transition-colors cursor-pointer"
                  >
                    {copied ? (
                      <CopyCheckIcon className="w-3 h-3 text-green-400" />
                    ) : (
                      <CopyIcon className="w-3 h-3" />
                    )}
                  </button>
                  <button
                    onClick={() => setTestResult(null)}
                    className="p-1 rounded hover:bg-white/10 text-white/40 hover:text-white transition-colors cursor-pointer"
                  >
                    <XIcon className="w-3 h-3" />
                  </button>
                </div>
              </div>
              <pre className="text-[9px] font-mono text-green-400/80 overflow-x-auto max-h-[80px] leading-relaxed whitespace-pre-wrap break-all">
                {testResult}
              </pre>
            </div>
          )}
        </>
      )}
    </div>
  );
}
