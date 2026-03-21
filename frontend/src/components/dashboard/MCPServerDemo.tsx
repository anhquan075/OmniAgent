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
  TrendingUpIcon,
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
    id: "sepolia",
    name: "Ethereum / Sepolia",
    icon: ZapIcon,
    color: "#627EEA",
    tools: [
      {
        name: "sepolia_createWallet",
        description: "Create wallet",
        riskLevel: "low",
        blockchain: "sepolia",
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
        name: "sepolia_getBalance",
        description: "Get balance",
        riskLevel: "low",
        blockchain: "sepolia",
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
        name: "sepolia_transfer",
        description: "Transfer ETH/USDT",
        riskLevel: "medium",
        blockchain: "sepolia",
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
        name: "sepolia_swap",
        description: "Swap tokens",
        riskLevel: "medium",
        blockchain: "sepolia",
        category: "defi",
        params: [
          { name: "amountIn", placeholder: "Amount in", required: true },
          { name: "tokenIn", placeholder: "Token in", required: true },
          { name: "tokenOut", placeholder: "Token out", required: true },
        ],
      },
      {
        name: "sepolia_supplyAave",
        description: "Supply to Aave",
        riskLevel: "medium",
        blockchain: "sepolia",
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
        name: "sepolia_withdrawAave",
        description: "Withdraw from Aave",
        riskLevel: "medium",
        blockchain: "sepolia",
        category: "lending",
        params: [
          { name: "amount", placeholder: "Amount (e.g., 500)", required: true },
        ],
      },
      {
        name: "sepolia_bridgeLayerZero",
        description: "Bridge via LayerZero",
        riskLevel: "high",
        blockchain: "sepolia",
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
    id: "x402",
    name: "X402 Robot Economy",
    icon: BotIcon,
    color: X402_COLOR,
    tools: [
      {
        name: "x402_list_services",
        description: "List hireable sub-agents",
        riskLevel: "low",
        blockchain: "sepolia",
        category: "x402",
      },
      {
        name: "x402_pay_subagent",
        description: "Pay sub-agent for task",
        riskLevel: "medium",
        blockchain: "sepolia",
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
        blockchain: "sepolia",
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
        blockchain: "sepolia",
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
        blockchain: "sepolia",
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
        blockchain: "sepolia",
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
        blockchain: "sepolia",
        category: "defi",
        params: [
          { name: "amount", placeholder: "Amount (e.g., 500)", required: true },
        ],
      },
      {
        name: "wdk_vault_getBalance",
        description: "Get vault balance",
        riskLevel: "low",
        blockchain: "sepolia",
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
        blockchain: "sepolia",
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
        blockchain: "sepolia",
        category: "defi",
      },
      {
        name: "wdk_engine_getCycleState",
        description: "Get cycle state",
        riskLevel: "low",
        blockchain: "sepolia",
        category: "defi",
      },
      {
        name: "wdk_engine_getRiskMetrics",
        description: "Get risk metrics",
        riskLevel: "low",
        blockchain: "sepolia",
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
        blockchain: "sepolia",
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
        blockchain: "sepolia",
        category: "lending",
        params: [
          { name: "amount", placeholder: "Amount (e.g., 500)", required: true },
        ],
      },
      {
        name: "wdk_aave_getPosition",
        description: "Get Aave position",
        riskLevel: "low",
        blockchain: "sepolia",
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
        blockchain: "sepolia",
        category: "account-abstraction",
        params: [
          { name: "owner", placeholder: "Owner EOA address", required: true },
        ],
      },
      {
        name: "erc4337_getAccountAddress",
        description: "Predict account address",
        riskLevel: "low",
        blockchain: "sepolia",
        category: "account-abstraction",
        params: [
          { name: "owner", placeholder: "Owner EOA address", required: true },
        ],
      },
      {
        name: "erc4337_isValidAccount",
        description: "Check valid account",
        riskLevel: "low",
        blockchain: "sepolia",
        category: "account-abstraction",
        params: [
          { name: "account", placeholder: "Account address", required: true },
        ],
      },
      {
        name: "erc4337_execute",
        description: "Execute transaction",
        riskLevel: "high",
        blockchain: "sepolia",
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
        blockchain: "sepolia",
        category: "account-abstraction",
        params: [
          { name: "account", placeholder: "Account address", required: true },
        ],
      },
      {
        name: "erc4337_addDeposit",
        description: "Add gas deposit",
        riskLevel: "medium",
        blockchain: "sepolia",
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
        blockchain: "sepolia",
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
        blockchain: "sepolia",
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
        blockchain: "sepolia",
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
        blockchain: "sepolia",
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
        blockchain: "sepolia",
        category: "account-abstraction",
        params: [
          { name: "token", placeholder: "Token address", required: true },
        ],
      },
      {
        name: "erc4337_getDeposit",
        description: "Get account deposit",
        riskLevel: "low",
        blockchain: "sepolia",
        category: "account-abstraction",
        params: [
          { name: "account", placeholder: "Account address", required: true },
        ],
      },
    ],
  },
  {
    id: "market",
    name: "Market Scanner",
    icon: TrendingUpIcon,
    color: "#10B981",
    tools: [
      {
        name: "market_get_price_matrix",
        description: "Get price matrix for pairs",
        riskLevel: "low",
        blockchain: "sepolia",
        category: "market",
        params: [
          {
            name: "pairs",
            placeholder: "Pairs (comma-separated, e.g., USDT/USDC)",
            required: false,
          },
        ],
      },
      {
        name: "market_get_best_opportunity",
        description: "Find best arb opportunity",
        riskLevel: "low",
        blockchain: "sepolia",
        category: "market",
        params: [
          {
            name: "minSpreadBps",
            placeholder: "Min spread (bps, default:15)",
            required: false,
          },
        ],
      },
      {
        name: "market_calculate_profit",
        description: "Calculate profit breakdown",
        riskLevel: "low",
        blockchain: "sepolia",
        category: "market",
        params: [
          { name: "spreadBps", placeholder: "Spread (bps)", required: true },
          { name: "volumeUsd", placeholder: "Volume (USD)", required: false },
          { name: "buyExchange", placeholder: "Buy exchange", required: false },
          { name: "sellExchange", placeholder: "Sell exchange", required: false },
        ],
      },
      {
        name: "market_start_scanner",
        description: "Start price monitoring",
        riskLevel: "low",
        blockchain: "sepolia",
        category: "market",
      },
      {
        name: "market_stop_scanner",
        description: "Stop price monitoring",
        riskLevel: "low",
        blockchain: "sepolia",
        category: "market",
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
        name: "wdk_bridge_usdt0",
        description: "Bridge USD₮0 cross-chain",
        riskLevel: "high",
        blockchain: "multi",
        category: "bridge",
        params: [
          { name: "targetChain", placeholder: "Target chain (e.g., arbitrum)", required: true },
          { name: "recipient", placeholder: "Recipient address", required: true },
          { name: "token", placeholder: "Token address", required: true },
          { name: "amount", placeholder: "Amount (6 decimals)", required: true },
        ],
      },
      {
        name: "wdk_bridge_usdt0_status",
        description: "Get bridge quote/status",
        riskLevel: "low",
        blockchain: "multi",
        category: "bridge",
        params: [
          { name: "targetChain", placeholder: "Target chain", required: true },
          { name: "recipient", placeholder: "Recipient address", required: true },
          { name: "token", placeholder: "Token address", required: true },
          { name: "amount", placeholder: "Amount (6 decimals)", required: true },
        ],
      },
      {
        name: "sepolia_bridgeLayerZero",
        description: "Bridge via LayerZero (legacy)",
        riskLevel: "high",
        blockchain: "sepolia",
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
    <div className="flex flex-col gap-2 sm:gap-3 h-full overflow-hidden">
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <div
              className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${serverStatus === "connected" ? "bg-green-400 shadow-[0_0_8px_rgba(34,197,94,0.5)]" : serverStatus === "connecting" ? "bg-yellow-400 animate-pulse" : "bg-red-400"}`}
            />
            <span
              className={`text-[9px] sm:text-[10px] font-mono uppercase tracking-wider ${serverStatus === "connected" ? "text-green-400" : serverStatus === "connecting" ? "text-yellow-400" : "text-red-400"}`}
            ></span>
          </div>
          <span className="text-[9px] sm:text-[10px] text-neutral-gray">
            {totalTools} tools
          </span>
        </div>
      </div>
      {isExpanded && (
        <>
          <div className="flex items-center justify-between p-1.5 sm:p-2 rounded-lg bg-white/5 border border-white/10">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <WalletIcon className="w-3 h-3 sm:w-4 sm:h-4 text-tether-teal" />
              <div className="flex flex-col">
                <span className="text-[9px] sm:text-[10px] text-white font-medium">
                  {isConnected && address
                    ? `${address.slice(0, 4)}...${address.slice(-3)}`
                    : "No wallet"}
                </span>
                <span className="text-[7px] sm:text-[8px] text-neutral-gray hidden sm:block">
                  {isConnected ? "Connected" : "Agent wallet"}
                </span>
              </div>
            </div>
            <div
              className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${isConnected ? "bg-green-400" : "bg-yellow-400"}`}
            />
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar pr-0.5 sm:pr-1 -mr-0.5 sm:-mr-1">
            <div className="grid grid-cols-1 gap-1.5 sm:gap-2">
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
                      className="w-full flex items-center gap-1.5 sm:gap-2 p-2 sm:p-2.5 hover:bg-white/[0.03] transition-colors cursor-pointer"
                    >
                      <Icon
                        className="w-3 h-3 sm:w-4 sm:h-4"
                        style={{ color: category.color }}
                      />
                      <span className="text-[10px] sm:text-[11px] font-medium text-white flex-1 text-left truncate">
                        {category.name}
                      </span>
                      <span className="text-[8px] sm:text-[9px] text-white/30">
                        {category.tools.length}
                      </span>
                      {isExpandedCat ? (
                        <ChevronDownIcon className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-white/30" />
                      ) : (
                        <ChevronRightIcon className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-white/30" />
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
                              className="p-2 sm:p-2.5 border-b border-white/5 last:border-b-0 hover:bg-white/[0.02] transition-all"
                            >
                              <div className="flex items-start justify-between gap-1.5 sm:gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 sm:gap-2">
                                    <span
                                      className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full flex-shrink-0"
                                      style={{
                                        backgroundColor: category.color,
                                        boxShadow: `0 0 6px ${category.color}40`,
                                      }}
                                    />
                                    <span className="text-[9px] sm:text-[10px] font-mono text-white/90 truncate">
                                      {tool.name}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1.5 sm:gap-2 mt-0.5 sm:mt-1 overflow-hidden">
                                    <span
                                      className={`text-[7px] sm:text-[8px] font-mono px-1 py-0.5 rounded ${risk.bg} ${risk.border} border flex-shrink-0`}
                                      style={{ color: risk.color }}
                                    >
                                      {risk.label}
                                    </span>
                                    <span className="text-[7px] sm:text-[8px] text-white/30 truncate hidden sm:block">
                                      {tool.description}
                                    </span>
                                  </div>
                                </div>
                                  <button
                                    onClick={() => {
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
                                    className="p-1 sm:p-1.5 rounded-md bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all cursor-pointer flex-shrink-0 active:scale-95 min-h-[44px] min-w-[44px] flex items-center justify-center sm:min-h-0 sm:min-w-0"
                                  >
                                    {isThisTesting ? (
                                      <Loader2Icon className="w-2.5 h-2.5 sm:w-3 sm:h-3 animate-spin" />
                                    ) : (
                                      <ZapIcon className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                                    )}
                                  </button>
                                </div>

                                {showArgsForTool &&
                                  tool.params &&
                                  tool.params.length > 0 && (
                                    <div className="mt-1.5 sm:mt-2 pt-1.5 sm:pt-2 border-t border-white/10">
                                      <div className="grid grid-cols-1 gap-1.5 sm:gap-2">
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
                                            className="w-full px-1.5 sm:px-2 py-1 sm:py-1.5 text-[9px] sm:text-[10px] font-mono bg-black/30 border border-white/10 rounded text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none min-h-[44px] sm:min-h-0"
                                          />
                                        ))}
                                        <button
                                          onClick={() => testTool(tool.name)}
                                          disabled={isTesting}
                                          className="px-2 sm:px-3 py-1 sm:py-1.5 text-[9px] sm:text-[10px] font-medium bg-white/10 hover:bg-white/20 text-white rounded border border-white/20 cursor-pointer disabled:opacity-50 active:scale-[0.98] min-h-[44px] sm:min-h-0"
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
              <div className="p-1.5 sm:p-2.5 rounded-lg bg-black/60 border border-white/10 flex-shrink-0">
                <div className="flex items-center justify-between mb-1 sm:mb-2">
                  <span className="text-[8px] sm:text-[9px] text-neutral-gray font-mono">
                    Response
                  </span>
                  <div className="flex items-center gap-0.5 sm:gap-1">
                    <button
                      onClick={() => copyToClipboard(testResult)}
                      className="p-0.5 sm:p-1 rounded hover:bg-white/10 text-white/40 hover:text-white transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center sm:min-h-0 sm:min-w-0"
                    >
                      {copied ? (
                        <CopyCheckIcon className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-green-400" />
                      ) : (
                        <CopyIcon className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                      )}
                    </button>
                    <button
                      onClick={() => setTestResult(null)}
                      className="p-0.5 sm:p-1 rounded hover:bg-white/10 text-white/40 hover:text-white transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center sm:min-h-0 sm:min-w-0"
                    >
                      <XIcon className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                    </button>
                  </div>
              </div>
              <pre className="text-[8px] sm:text-[9px] font-mono text-green-400/80 overflow-x-auto max-h-[60px] sm:max-h-[80px] leading-relaxed whitespace-pre-wrap break-all">
                {testResult}
              </pre>
            </div>
          )}
        </>
      )}
    </div>
  );
}
