import { getApiUrl } from "@/lib/api";
import { useChat } from "@ai-sdk/react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { AnimatePresence, motion } from "framer-motion";
import {
  BotIcon,
  BrainCircuitIcon,
  CoinsIcon,
  ExternalLink,
  GlobeIcon,
  LayersIcon,
  Loader2,
  MenuIcon,
  ServerIcon,
  TrendingUpIcon,
  WalletIcon,
  XIcon,
  Zap,
  ArrowRightLeft,
  Shield,
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { ChatContainer } from "./components/chat/ChatContainer";
import { ChatHistorySidebar } from "./components/chat/ChatHistorySidebar";
import AgentBrain from "./components/dashboard/AgentBrain";
import FleetStatus from "./components/dashboard/FleetStatus";
import MCPServerDemo from "./components/dashboard/MCPServerDemo";
import { ConnectionModal } from "./components/shared/ConnectionModal";
import { GuestSplash } from "./components/shared/GuestSplash";
import { OnboardingTooltip } from "./components/shared/OnboardingTooltip";
import { useOnboarding } from "./hooks/useOnboarding";
import { FaucetStatus } from "./components/shared/FaucetStatus";
interface BentoCardProps {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  className?: string;
  onToggle?: () => void;
  isExpanded?: boolean;
}

const BentoCard = ({
  title,
  icon: Icon,
  children,
  className = "",
  onToggle,
  isExpanded,
}: BentoCardProps) => (
  <div
    className={`rounded-2xl p-4 sm:p-5 md:p-6 flex flex-col gap-3 sm:gap-4 shadow-2xl transition-all duration-500 group bg-space-black/60 backdrop-blur-xl border border-white/10 hover:border-tether-teal/30 hover:shadow-[0_0_20px_rgba(38,161,123,0.1)] relative overflow-hidden ${className}`}
  >
    <div className="absolute top-0 right-0 w-24 h-24 sm:w-32 sm:h-32 bg-tether-teal/5 rounded-full blur-[40px] sm:blur-[60px] pointer-events-none -translate-y-1/2 translate-x-1/2"></div>
    <div className="flex items-center justify-between flex-shrink-0 relative z-10">
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="p-2 rounded-lg bg-white/5 text-tether-teal group-hover:scale-110 transition-transform font-heading border border-white/5 group-hover:border-tether-teal/30 group-hover:bg-tether-teal/10">
          <Icon className="w-4 h-4" />
        </div>
        <h3 className="font-heading text-[10px] sm:text-[11px] tracking-[0.15em] sm:tracking-[0.2em] text-neutral-gray-light uppercase group-hover:text-white transition-colors">
          {title}
        </h3>
      </div>
      <div className="flex items-center gap-3">
        {onToggle && isExpanded !== undefined && (
          <button
            onClick={onToggle}
            className="flex items-center gap-1 text-neutral-gray hover:text-white transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center sm:min-h-0 sm:min-w-0"
            aria-label={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            )}
            <span className="hidden sm:inline uppercase tracking-wider text-[10px]">
              {isExpanded ? "Collapse" : "Expand"}
            </span>
          </button>
        )}
        <div className="w-1.5 h-1.5 rounded-full bg-tether-teal/40 shadow-[0_0_8px_rgba(38,161,123,0.4)] animate-pulse"></div>
      </div>
    </div>
    <div className="flex-1 min-h-0 relative z-10">{children}</div>
  </div>
);

const INITIAL_SESSION_ID = "session-" + Date.now();

export default function App() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isConnectionModalOpen, setIsConnectionModalOpen] = useState(false);
  const [mcpToolsExpanded, setMcpToolsExpanded] = useState(true);
  const [agentStreamStatus, setAgentStreamStatus] = useState<any[]>([]);
  
  const { shouldShow, completeOnboarding, neverShowAgain } = useOnboarding();
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (shouldShow) {
      setShowOnboarding(true);
    }
  }, [shouldShow]);

  const initialSuggestions = [
    { label: 'Sepolia Balance', prompt: 'Check my wallet balance on Sepolia testnet.', icon: WalletIcon },
    { label: 'Sub-Agents', prompt: 'List all available sub-agents in the X402 fleet.', icon: BotIcon },
    { label: 'Vault State', prompt: 'Show me the current vault state and buffer utilization.', icon: LayersIcon },
    { label: 'Cycle State', prompt: 'What is the current cycle state of the WDK engine?', icon: Zap },
    { label: 'Aave Position', prompt: 'Check my Aave lending position and health factor.', icon: CoinsIcon },
    { label: 'Smart Account', prompt: 'Get the ERC-4337 smart account address for wallet 0xB789D888A53D34f6701C1A5876101Cb32dbF17cF and check its balance.', icon: ServerIcon },
    { label: 'Market Prices', prompt: 'Get the current prices for ETH, BTC, and BNB from exchanges.', icon: TrendingUpIcon },
    { label: 'Bridge Quote', prompt: 'Get a quote to bridge 100 USDT to Arbitrum using USD protocol.', icon: GlobeIcon },
  ];
  const [suggestions, setSuggestions] = useState<any[]>(initialSuggestions);
  const [pendingSuggestions, setPendingSuggestions] = useState<any[]>([]);
  const queryClient = useQueryClient();
  const { address, isConnected } = useAccount();

  // Local state for input as per modern ai-sdk best practices
  const [input, setInput] = useState("");
  // Live Stats Fetching
  const { data: stats, refetch: refetchStats } = useQuery({
    queryKey: ["agent-stats"],
    queryFn: async () => {
      const res = await fetch(getApiUrl("/api/stats"));
      if (!res.ok) throw new Error("Stats fetch failed");
      return res.json();
    },
    refetchInterval: 10000,
  });

  const agentState = stats?.system?.isPaused
    ? "IDLE"
    : stats?.system?.canExecute
      ? "EXECUTING"
      : stats?.system
        ? "SCANNING"
        : "IDLE";

  const [sessions, setSessions] = useState([
    {
      id: INITIAL_SESSION_ID,
      title: "Strategy Setup",
      lastMessage: "WDK Monitoring Active",
      timestamp: new Date(),
    },
  ]);
  const [activeSessionId, setActiveSessionId] = useState(INITIAL_SESSION_ID);

  const {
    messages,
    sendMessage,
    status,
    setMessages,
    stop,
    regenerate,
    error,
    addToolResult,
  } = useChat({
    api: "/api/chat",
    id: activeSessionId,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    initialMessages: [
      {
        id: "initial-1",
        role: "assistant",
        content:
          "Welcome to **OmniAgent** - your autonomous yield strategist.\n\n**What I can do:**\n- Check your wallet balances and portfolio\n- Monitor vault positions and NAV\n- Execute yield strategies across chains\n- Manage the robot fleet for automated trading\n- Transfer, swap, and bridge tokens\n\n**Quick tips:**\n- Click the suggestion chips below to get started\n- Ask me anything about your portfolio or strategies\n- I can execute transactions with your approval\n\nHow can I help you today?",
      } as any,
    ],
    onData: (dataPart: any) => {
      if (dataPart.type === "data-status") {
        setAgentStreamStatus(prev => [...prev.slice(-10), dataPart]);
      } else if (dataPart.type === "data-suggestions") {
        setPendingSuggestions(Array.isArray(dataPart.data) ? dataPart.data : []);
      }
    },
    onError: (err) => {
      console.error("[App] useChat Error:", err);
    },
  } as any);

  const isLoading = status === "submitted" || status === "streaming";

  const initialUpdatedRef = useRef(false);

  // When activeSessionId changes, reset messages to initial state
  // This ensures each new session starts with the default initial message
  useEffect(() => {
    initialUpdatedRef.current = false;
    setMessages([
      {
        id: "initial-1",
        role: "assistant",
        content:
          "System initialized. I am your **OmniAgent Strategist**. I am currently monitoring cross-chain liquidity for USDT and XAUT yield optimization.",
      } as any,
    ]);
    setSuggestions(initialSuggestions);
  }, [activeSessionId, setMessages]);

  // Update initial message when wallet connects or stats arrive
  useEffect(() => {
    if (
      isConnected &&
      address &&
      messages?.length === 1 &&
      messages[0].id === "initial-1" &&
      !initialUpdatedRef.current
    ) {
      const portfolioMsg = stats?.vault?.totalAssets
        ? `\n\n**Your Portfolio:**\n- Vault Value: ${stats.vault.totalAssets} USDT\n- Expected Drawdown: ${(stats.risk?.drawdownBps || 0) / 100}%`
        : "";

      initialUpdatedRef.current = true;
      setMessages([
        {
          id: "initial-1",
          role: "assistant",
          content: `Welcome back, Commander **${address.slice(0, 6)}...${address.slice(-4)}**!\n\nI am your **OmniAgent Autonomous Strategist**. All settlement rails are hot and ready.${portfolioMsg}\n\n**What would you like to do?**\n- Check my portfolio\n- View robot fleet status\n- Analyze yield opportunities\n- Execute a transaction`,
        } as any,
      ]);
    }
  }, [isConnected, address, setMessages, stats, messages?.length]);

  // Apply pending suggestions when streaming finishes
  useEffect(() => {
    if (status === 'ready' && pendingSuggestions.length > 0) {
      setSuggestions(pendingSuggestions);
      setPendingSuggestions([]);
    }
  }, [status, pendingSuggestions]);

  // Automatically close ConnectionModal when connected
  useEffect(() => {
    if (isConnected) {
      setIsConnectionModalOpen(false);
    }
  }, [isConnected]);

  useEffect(() => {
    if (!isConnected || !address) return;

    const handleBeforeUnload = () => {
      const payload = JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: { name: "smartaccount_revokeSessionKey", arguments: {} },
      });
      navigator.sendBeacon(
        "/api/mcp",
        new Blob([payload], { type: "application/json" })
      );
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isConnected, address]);

  const handleNewChat = () => {
    // Stop any active stream first
    if (status === "streaming" || status === "submitted") {
      stop();
    }

    const newId = Date.now().toString();
    const newSession = {
      id: newId,
      title: "New Command",
      lastMessage: "No commands yet",
      timestamp: new Date(),
    };

    setSessions((prev) => [newSession, ...prev]);

    // CRITICAL: Change activeSessionId FIRST
    // This causes useChat hook to re-initialize with new `id` prop and load initialMessages
    // If we setMessages() before changing activeSessionId, the hook reset clears our messages
    initialUpdatedRef.current = false;
    setActiveSessionId(newId);

    // Let useChat hook initialize with initialMessages on the new session ID
    // The hook will use initialMessages from config when id changes
    setIsMobileMenuOpen(false);
  };

  // Sync session last message and state
  useEffect(() => {
    if (messages && messages.length > 1) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.role === "user") {
        let content = "Command sent";
        const msgContent = (lastMsg as any).content;
        if (typeof msgContent === "string") {
          content = msgContent;
        } else if ((lastMsg as any).parts) {
          content = (lastMsg as any).parts
            .filter((p: any) => p.type === "text")
            .map((p: any) => p.text)
            .join("");
        }
        setSessions((prev) =>
          prev.map((s) =>
            s.id === activeSessionId ? { ...s, lastMessage: content } : s,
          ),
        );
      }
    }
  }, [messages, activeSessionId]);

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
  };

  const onHandleSubmit = async (
    e?: React.FormEvent | { preventDefault: () => void },
    overrideText?: string,
  ) => {
    if (e && e.preventDefault) e.preventDefault();

    const text = (overrideText || input).trim();
    if (!text) return;

    // Validate messages array exists and is not empty
    if (!Array.isArray(messages) || messages.length === 0) {
      return;
    }

    if (status === "streaming" || status === "submitted") {
      stop();
    }

    setInput("");

    try {
      await new Promise((resolve) => setTimeout(resolve, 50));
      await sendMessage({ text });
    } catch (err) {
      console.error("[App] Failed to send message:", err);
    }
  };

  const handleRestrictedAction = (e) => {
    if (!isConnected) {
      e.preventDefault();
      e.stopPropagation();
      setIsConnectionModalOpen(true);
    }
  };

  return (
    <div className="h-screen w-full bg-space-black text-white font-sans flex flex-col items-center selection:bg-tether-teal/30 overflow-hidden">
      <AnimatePresence>
        {!isConnected && <GuestSplash key="splash" />}
      </AnimatePresence>

      <OnboardingTooltip
        isOpen={showOnboarding}
        onComplete={completeOnboarding}
        onNeverShowAgain={neverShowAgain}
      />

      <ConnectionModal
        isOpen={isConnectionModalOpen}
        onClose={() => setIsConnectionModalOpen(false)}
      />

      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-5%] w-[50%] h-[50%] bg-tether-teal/5 rounded-full blur-[100px] will-change-transform opacity-40"></div>
        <div className="absolute bottom-[-10%] right-[-5%] w-[50%] h-[50%] bg-xaut-gold/5 rounded-full blur-[100px] will-change-transform opacity-40"></div>
      </div>

      {/* 
          Dashboard Container with Action Gate 
          When not connected, clicking anywhere on the blurred dashboard triggers the modal.
      */}
      <div
        onClick={!isConnected ? handleRestrictedAction : undefined}
        className={`w-full h-full flex flex-col relative z-10 p-3 md:p-6 overflow-hidden transition-all duration-1000 ${!isConnected ? "blur-2xl scale-110 opacity-30 cursor-pointer" : "blur-0 scale-100 opacity-100"}`}
      >
        <header className="h-14 md:h-16 flex-shrink-0 flex items-center justify-between px-4 md:px-6 glass rounded-2xl border border-white/10 mb-3 md:mb-4 shadow-glow-sm relative z-50">
          <div className="flex items-center gap-3 md:gap-4">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-space-black flex items-center justify-center shadow-glow-md overflow-hidden border border-tether-teal/20">
              <img
                src="/imgs/mascot-owl-no-bg.png"
                alt="OmniAgent"
                className="w-full h-full object-contain"
              />
            </div>
            <div className="flex flex-col">
              <h1 className="text-sm md:text-lg font-heading font-bold tracking-tight bg-clip-text text-transparent bg-[linear-gradient(135deg,#26A17B,#00D1FF)] uppercase truncate max-w-[150px] md:max-w-none">
                OmniAgent
              </h1>
              <div className="flex items-center gap-2">
                <span className="w-1 h-1 md:w-1.5 md:h-1.5 rounded-full bg-tether-teal"></span>
                <span className="text-[7px] md:text-[9px] font-heading tracking-widest text-neutral-gray-light uppercase">
                  Strategist Active
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 md:gap-4">
            <div className="h-8 border-l border-white/10 mx-1 md:mx-2 hidden lg:block"></div>

            <FaucetStatus />

            <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 mr-2 shadow-glow-sm">
              <div className="w-5 h-5 rounded-full bg-[#627EEA]/10 flex items-center justify-center border border-[#627EEA]/20">
                <img
                  src="/coins/ethereum.png"
                  alt="Ethereum"
                  className="w-3.5 h-3.5 object-contain"
                  onError={(e) => {
                    e.currentTarget.src = "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png";
                  }}
                />
              </div>
              <div className="flex flex-col leading-none">
                <span className="text-[9px] font-bold text-[#627EEA] uppercase">
                  Ethereum
                </span>
                <span className="text-[7px] text-neutral-gray uppercase tracking-wider">
                  {import.meta.env.VITE_DEFAULT_NETWORK?.includes("mainnet") ||
                  (import.meta.env.VITE_DEFAULT_NETWORK?.includes("ethereum") &&
                    !import.meta.env.VITE_DEFAULT_NETWORK?.includes("sepolia"))
                    ? "Mainnet"
                    : "Sepolia"}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2" data-tour="connect">
              <ConnectButton
                chainStatus="full"
                showBalance={false}
                accountStatus="avatar"
              />
            </div>
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="lg:hidden p-2 rounded-lg bg-white/5 border border-white/10 text-tether-teal min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
            >
              {isMobileMenuOpen ? (
                <XIcon className="w-5 h-5" />
              ) : (
                <MenuIcon className="w-5 h-5" />
              )}
            </button>
          </div>
        </header>

        <div className="flex-1 flex flex-col lg:flex-row gap-3 md:gap-6 relative overflow-hidden">
          {/* Column 1: Monitoring */}
          <div
            className={`
            ${isMobileMenuOpen ? "flex flex-col flex-1 overflow-y-auto p-4 bg-space-black/95 border-b border-white/10 mb-4" : "hidden"} 
            lg:relative lg:inset-auto lg:flex lg:flex-[2.5] xl:flex-[2] lg:flex-col lg:gap-4 xl:gap-6 lg:min-w-0 lg:min-h-0 lg:bg-transparent lg:overflow-hidden lg:p-0 lg:border-none lg:mb-0
          `}
          >
            <BentoCard
              title="MCP Tools"
              icon={ServerIcon}
              className={`shrink-0 transition-all duration-300 ${mcpToolsExpanded ? "h-[320px] sm:h-[360px] md:h-[400px] lg:h-[480px]" : "h-[64px] md:h-[80px]"}`}
              onToggle={() => setMcpToolsExpanded(!mcpToolsExpanded)}
              isExpanded={mcpToolsExpanded}
              data-tour="mcp-tools"
            >
              <MCPServerDemo
                isExpanded={mcpToolsExpanded}
                onToggleExpand={setMcpToolsExpanded}
              />
            </BentoCard>

            <div className="flex-1 min-h-0 glass-dark rounded-3xl overflow-hidden border border-white/10 relative mt-4 lg:mt-0">
              <ChatHistorySidebar
                sessions={sessions}
                activeSessionId={activeSessionId}
                onSelectSession={(id) => {
                  setActiveSessionId(id);
                  setIsMobileMenuOpen(false);
                }}
                onNewChat={handleNewChat}
                onDeleteSession={(id) =>
                  setSessions((s) => s.filter((x) => x.id !== id))
                }
              />
            </div>
          </div>

          {/* Column 2: Agent Terminal */}
          <div
            className={`flex-[7] xl:flex-[6] flex flex-col min-w-0 min-h-0 glass-dark rounded-3xl overflow-hidden border border-white/10 shadow-2xl relative ${isMobileMenuOpen ? "hidden lg:flex" : "flex"}`}
          >
            <div className="flex-1 flex flex-col min-h-0" data-tour="chat">
              <ChatContainer
                messages={messages}
                sendMessage={sendMessage}
                status={status}
                input={input}
                handleInputChange={onInputChange}
                handleSubmit={onHandleSubmit}
                setMessages={setMessages}
                regenerate={regenerate}
                stop={stop}
                error={error}
                data={agentStreamStatus}
                addToolOutput={addToolResult}
                suggestions={suggestions}
                showQuickStart={true}
              />
            </div>
          </div>

          {/* Column 3: Operational State */}
          <div
            className={`
            ${isMobileMenuOpen ? "flex flex-col flex-1 overflow-y-auto p-4 bg-space-black/95" : "hidden"} 
            xl:relative xl:inset-auto xl:flex xl:flex-[2.5] 2xl:flex-[2] xl:flex-col xl:gap-4 2xl:gap-6 xl:min-w-0 xl:min-h-0 xl:bg-transparent xl:overflow-hidden xl:pl-1 xl:p-0
          `}
          >
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar flex flex-col gap-6 pr-1">
              <BentoCard
                title="Robot Fleet Operations"
                icon={BotIcon}
                className="min-h-[280px] shrink-0"
                data-tour="fleet"
              >
                <FleetStatus />
              </BentoCard>

              <BentoCard
                title="Agent Live Strategy"
                icon={BrainCircuitIcon}
                className="flex-1 min-h-[300px]"
              >
                <div className="h-full overflow-y-auto custom-scrollbar pr-2">
                  <AgentBrain stats={stats} />
                </div>
              </BentoCard>
            </div>
          </div>
        </div>

        <footer className="h-10 md:h-12 flex-shrink-0 flex items-center justify-between mt-2 md:mt-4 px-2 opacity-40">
          <p className="text-[7px] md:text-[9px] font-heading tracking-[0.2em] md:tracking-[0.3em] text-neutral-gray uppercase truncate mr-4">
            Economic Infrastructure Powered by Tether WDK
          </p>
          <div className="flex items-center gap-2 md:gap-4 text-[7px] md:text-[9px] font-mono whitespace-nowrap">
            <span className="hidden sm:inline">
              NETWORK:{" "}
              <span className="text-tether-teal uppercase">Multi-Chain</span>
            </span>
            <span>
              SETTLEMENT:{" "}
              <span className="text-cyber-cyan uppercase">
                {stats?.system?.isPaused ? "PAUSED" : "ONLINE"}
              </span>
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}
