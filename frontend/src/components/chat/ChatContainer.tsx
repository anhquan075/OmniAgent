import React, { useRef, useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChatHistory } from './ChatHistory';
import { MessageInput } from './MessageInput';
import { cn } from '@/lib/utils';
import { CpuIcon, ZapIcon, ShieldCheckIcon, BarChart3Icon, BrainCircuitIcon, CoinsIcon, BotIcon } from 'lucide-react';
import { OperationalPlan, TaskStatus } from './TaskStep';
import { Conversation } from '../ai-elements/Conversation';

interface ChatContainerProps {
  messages: any[];
  isLoading?: boolean;
  status: 'submitted' | 'streaming' | 'ready' | 'error';
  input: string;
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement> | React.ChangeEvent<HTMLInputElement>) => void;
  handleSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  sendMessage: (message: { text: string }) => Promise<void>;
  addToolOutput: (output: any) => void;
  setMessages: React.Dispatch<React.SetStateAction<any[]>>;
  regenerate: () => Promise<void>;
  stop: () => void;
  error?: Error;
  data?: any[];
  suggestions?: any[];
}

const SUGGESTED_ACTIONS = [
  { label: 'Vault Status', icon: BarChart3Icon, prompt: 'Show me the current vault status and buffer utilization.' },
  { label: 'Check Risk', icon: ShieldCheckIcon, prompt: 'What are the current ZK-risk parameters?' },
  { label: 'My Balance', icon: CoinsIcon, prompt: 'What is my current wallet balance on BNB Chain?' },
  { label: 'Get USDT', icon: ZapIcon, prompt: 'Check my USDT balance in the vault.' },
  { label: 'Bridge Funds', icon: ZapIcon, prompt: 'Show me how to bridge USDT to another chain.' },
  { label: 'Smart Account', icon: ZapIcon, prompt: 'Show me my ERC-4337 smart account details.' },
  { label: 'Robot Fleet', icon: BotIcon, prompt: 'What is the status of the robot fleet?' },
  { label: 'Start Fleet', icon: BotIcon, prompt: 'Start the robot fleet simulator.' },
];

export function ChatContainer({ 
  messages = [], 
  isLoading, 
  status, 
  input, 
  handleInputChange, 
  handleSubmit, 
  sendMessage, 
  addToolOutput,
  setMessages, 
  regenerate,  stop,
  error,
  data,
  suggestions
}: ChatContainerProps) {  
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  
  const safeMessages = Array.isArray(messages) && messages.length > 0 ? messages : [];

  // Extract real-time status from data parts
  const currentAgentStatus = React.useMemo(() => {
    // 1. Check the 'data' array from useChat (preferred for writeData in v6)
    if (data && Array.isArray(data) && data.length > 0) {
      for (let i = data.length - 1; i >= 0; i--) {
        const d = data[i];
        if (d && typeof d === 'object' && d.type === 'data-status') return d.data;
      }
    }

    // 2. Fallback to checking messages parts (for merged streams)
    if (safeMessages && safeMessages.length > 0) {
      for (let i = safeMessages.length - 1; i >= 0; i--) {
        const parts = (safeMessages[i] as any).parts;
        if (parts && Array.isArray(parts)) {
          for (let j = parts.length - 1; j >= 0; j--) {
            const p = parts[j];
            if (p.type === 'data-status') return p.data;
            if (p.type === 'data' && p.data?.type === 'data-status') return p.data.data;
          }
        }
      }
    }
    return null;
  }, [data, safeMessages]);

  // Extract dynamic suggestions - prefer passed prop, fallback to message parts
  const dynamicSuggestions = React.useMemo(() => {
    // Priority 1: Use suggestions passed from App (via experimental_onData)
    if (suggestions && suggestions.length > 0) {
      return suggestions;
    }
    // Priority 2: Extract from message parts
    if ((status !== 'ready' && status !== 'streaming') || !messages || messages.length === 0) return null;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role !== 'assistant') return null;
    
    const parts = (lastMsg as any).parts;
    if (parts && Array.isArray(parts)) {
      const suggestionPart = parts.find((p: any) => p.type === 'data-suggestions');
      return suggestionPart?.data || null;
    }
    return null;
  }, [messages, status, suggestions]);

  const [persistentSuggestions, setPersistentSuggestions] = useState(SUGGESTED_ACTIONS);

  useEffect(() => {
    if (dynamicSuggestions && dynamicSuggestions.length > 0) {
      setPersistentSuggestions(dynamicSuggestions);
    }
  }, [dynamicSuggestions]);

  const activeSuggestions = persistentSuggestions;

  // Roadmap steps for the autonomous loop
  const roadmapSteps = React.useMemo(() => {
    const currentProgress = currentAgentStatus?.progress || 0;
    const currentThought = currentAgentStatus?.thought;

    const getStatus = (targetProgress: number): TaskStatus => {
      if (currentProgress >= targetProgress) return 'completed';
      if (currentProgress > targetProgress - 40) return 'in-progress';
      return 'pending';
    };

    const getDetails = (label: string, defaultDetails: string, targetProgress: number) => {
      if (getStatus(targetProgress) === 'in-progress' && currentThought) {
        return currentThought;
      }
      return defaultDetails;
    };

    return [
      { label: 'Risk Analysis', status: getStatus(40), details: getDetails('Risk Analysis', 'ZK-verified Monte Carlo simulations', 40) },
      { label: 'Strategy Formulation', status: getStatus(80), details: getDetails('Strategy Formulation', 'Yield scout on Solana & TON', 80) },
      { label: 'Tactical Execution', status: getStatus(100), details: getDetails('Tactical Execution', 'OmniAgent settlement & rebalance', 100) }
    ];
  }, [currentAgentStatus]);

  // Check if the agent has started streaming text content
  const hasStartedText = React.useMemo(() => {
    if (!messages || messages.length === 0) return false;
    const assistantMessages = messages.filter(m => m.role === 'assistant');
    if (assistantMessages.length === 0) return false;
    
    const lastAssistantMsg = assistantMessages[assistantMessages.length - 1];
    
    if (typeof lastAssistantMsg.content === 'string' && lastAssistantMsg.content.trim().length > 0) return true;
    const parts = (lastAssistantMsg as any).parts;
    return Array.isArray(parts) && parts.some((p: any) => p.type === 'text' && p.text && p.text.trim().length > 0);
  }, [messages]);

  // A refined streaming status that knows when to "finish" visually
  const isActuallyStreaming = React.useMemo(() => {
    return status === 'streaming' || status === 'submitted';
  }, [status]);

  // Smart Scroll: Track if user is at bottom
  const handleScroll = useCallback(() => {
    const container = scrollRef.current;
    if (container) {
      const { scrollTop, scrollHeight, clientHeight } = container;
      // If user is within 100px of bottom, consider it "at bottom"
      const isBottom = scrollHeight - scrollTop - clientHeight < 100;
      setIsAtBottom(isBottom);
    }
  }, []);

  // Force scroll to bottom on every update IF we are already at bottom
  useEffect(() => {
    if (isAtBottom && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isAtBottom, isActuallyStreaming]);

  return (
    <div className="flex flex-col h-full w-full rounded-2xl overflow-hidden bg-[#0B0E14]/80 backdrop-blur-xl shadow-2xl shadow-tether-teal/5 relative">
      {/* Premium Header with Telemetry */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-2.5 sm:py-3 border-b border-white/10 bg-black/20 relative z-10">
        <div className="flex flex-col">
          <h2 className="font-heading text-tether-teal text-[11px] sm:text-sm font-semibold tracking-wider flex items-center gap-2 sm:gap-3">
            <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-tether-teal"></div>
            Strategist Terminal
          </h2>
          <div className="flex items-center gap-3 mt-1 opacity-60">
            <div className="flex items-center gap-1 text-[7px] sm:text-[8px] font-heading tracking-widest text-neutral-gray-light uppercase">
              <span className="text-cyber-blue">Lat:</span> 24ms
            </div>
            <div className="flex items-center gap-1 text-[7px] sm:text-[8px] font-heading tracking-widest text-neutral-gray-light uppercase">
              <span className="text-neon-green">TPS:</span> 1.4k
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          {/* Progress Bar for Agent Thinking */}
          {currentAgentStatus && (
            <div className="flex flex-col items-end mr-4 min-w-[150px] max-w-[250px]">
              <div className="flex items-center gap-2 mb-1 overflow-hidden w-full justify-end">
                <span className="text-[7px] font-heading text-tether-teal uppercase tracking-widest whitespace-nowrap">
                  [{currentAgentStatus.status}]
                </span>
                <span className="text-[7px] text-gray-400 font-mono truncate">
                  {currentAgentStatus.thought || 'Processing...'}
                </span>
                <span className="text-[7px] font-mono text-cyber-cyan shrink-0">
                  (progress: {currentAgentStatus.progress}%)
                </span>
              </div>
              <div className="w-full h-0.5 bg-white/5 rounded-full overflow-hidden">
                <motion.div 
                  className="h-full bg-tether-teal shadow-glow-sm"
                  initial={{ width: 0 }}
                  animate={{ width: `${currentAgentStatus.progress}%` }}
                />
              </div>
            </div>
          )}

          <div className="flex flex-col items-end mr-2">
            <span className="text-[7px] font-heading text-neutral-gray uppercase tracking-widest">Autonomous Feed</span>
            <div className="flex items-center gap-1.5">
              <div className="w-1 h-1 rounded-full bg-neon-green"></div>
              <span className="text-[9px] font-mono text-gray-400">WDK: Connected</span>
            </div>
          </div>
          <div className="h-8 border-l border-white/10 hidden sm:block"></div>
          <div className="text-xs font-sans text-gray-400 flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
            <motion.span 
              className="hidden sm:inline font-heading text-[10px] tracking-widest text-tether-teal"
              animate={!isActuallyStreaming ? { y: [0, -2, 0] } : {}}
              transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
            >
              Active
            </motion.span>
          </div>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <Conversation 
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6 scroll-smooth scrollbar-none custom-scrollbar pb-32"
        style={{ overflowAnchor: 'auto' }}
      >
        <ChatHistory messages={messages} isStreaming={isActuallyStreaming} addToolOutput={addToolOutput} />
        
        {isActuallyStreaming && (
          <div className="mx-2 mt-4 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div className="flex items-center gap-2 text-gray-400 font-sans text-sm ml-2">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-tether-teal" />
                <span className="w-1.5 h-1.5 rounded-full bg-tether-teal" />
                <span className="w-1.5 h-1.5 rounded-full bg-tether-teal" />
              </div>
              <span className="tracking-widest text-[9px] uppercase font-heading text-tether-teal/60 ml-2 animate-pulse">
                {hasStartedText
                  ? "Strategist: Responding..."
                  : (currentAgentStatus 
                      ? `[${currentAgentStatus.status}] ${currentAgentStatus.thought || 'Processing...'} (progress: ${currentAgentStatus.progress}%)` 
                      : "Neural Link Active...")}
              </span>
            </div>
          </div>
        )}

        {error && (
          <div className="mx-2 mt-4 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 animate-in fade-in slide-in-from-top-2 duration-500">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-red-500/20 text-red-400">
                <BrainCircuitIcon className="w-4 h-4" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-heading font-bold text-red-400 uppercase tracking-widest">Neural Link Severed</span>
                <span className="text-[9px] text-red-400/60 font-mono">CODE: {error.name || 'UNKNOWN_ERR'}</span>
              </div>
            </div>
            <p className="text-xs text-gray-300 mb-4 leading-relaxed">
              {error.message || "An unexpected error occurred in the autonomous strategy bridge. Connection state unstable."}
            </p>
            <button
              onClick={() => regenerate()}
              className="px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white text-[10px] font-heading font-bold transition-all shadow-glow-sm flex items-center gap-2 uppercase tracking-widest"
            >
              <ZapIcon className="w-3 h-3" />
              Reconnect & Retry
            </button>
          </div>
        )}
      </Conversation>

      {/* Input Anchored Area */}
      <div className="p-4 bg-gradient-to-t from-black/80 via-black/40 to-transparent border-t border-white/5">
        {/* Suggested Actions Chips */}
        {activeSuggestions && (
          <div className={cn(
            "flex items-center gap-2 mb-4 overflow-x-auto pb-2 scrollbar-none no-scrollbar px-1 transition-opacity duration-300",
            isActuallyStreaming && "opacity-40 pointer-events-none"
          )}>
             {activeSuggestions.map((action: any) => (
               <button
                 key={action.label}
                  onClick={() => {
                    if (isActuallyStreaming) return;
                    const text = (action.prompt || "").trim();
                    if (!text) return;
                    if (!Array.isArray(messages) || messages.length === 0) return;
                    sendMessage({ text });
                  }}
                  disabled={isActuallyStreaming}
                 className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/5 text-[9px] font-heading tracking-widest text-neutral-gray-light hover:bg-tether-teal/10 hover:border-tether-teal/30 hover:text-tether-teal transition-all duration-300 disabled:cursor-not-allowed"
              >
                {action.icon && <action.icon className="w-3 h-3" />}
                {action.label}
              </button>
            ))}
          </div>
        )}
        
        <MessageInput 
          input={input}
          handleInputChange={handleInputChange}
          handleSubmit={handleSubmit}
          status={status}
          stop={stop}
          isActuallyStreaming={isActuallyStreaming}
        />
      </div>
    </div>
  );
}
