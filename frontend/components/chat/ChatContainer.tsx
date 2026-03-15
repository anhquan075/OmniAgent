import React, { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChatHistory } from './ChatHistory';
import { MessageInput } from './MessageInput';
import { CpuIcon, ZapIcon, ShieldCheckIcon, BarChart3Icon, BrainCircuitIcon } from 'lucide-react';
import { OperationalPlan, TaskStatus } from './TaskStep';
import { Conversation } from '../../src/components/ai-elements/conversation.jsx';

interface ChatContainerProps {
  messages: any[];
  isLoading?: boolean;
  status: 'submitted' | 'streaming' | 'ready' | 'error';
  input: string;
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement> | React.ChangeEvent<HTMLInputElement>) => void;
  handleSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  sendMessage: (message: { text: string }) => Promise<void>;
  setMessages: React.Dispatch<React.SetStateAction<any[]>>;
  regenerate: () => Promise<void>;
  stop: () => void;
  error?: Error;
  data?: any[];
}

const SUGGESTED_ACTIONS = [
  { label: 'Vault Status', icon: BarChart3Icon, prompt: 'Show me the current vault status and buffer utilization.' },
  { label: 'Check Risk', icon: ShieldCheckIcon, prompt: 'What are the current ZK-risk parameters?' },
  { label: 'Pivot Gold', icon: ZapIcon, prompt: 'Simulate a rebalance to Tether Gold (XAU₮).' },
  { label: 'Harvest Yield', icon: CpuIcon, prompt: 'Check for available yield to harvest.' },
];

export function ChatContainer({ 
  messages, 
  isLoading, 
  status,
  input, 
  handleInputChange, 
  handleSubmit, 
  sendMessage, 
  setMessages,
  regenerate,
  stop,
  error,
  data 
}: ChatContainerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Extract real-time status from data parts in the last message
  const currentAgentStatus = React.useMemo(() => {
    if (status !== 'submitted' && status !== 'streaming') return null;
    
    // Find the latest status data part across all messages (usually the last one)
    for (let i = messages.length - 1; i >= 0; i--) {
      const parts = (messages[i] as any).parts;
      if (parts && Array.isArray(parts)) {
        const statusPart = parts.find((p: any) => p.type === 'data-status');
        if (statusPart) return statusPart.data;
      }
    }
    return null;
  }, [messages, status]);

  // Extract dynamic suggestions from the last message
  const dynamicSuggestions = React.useMemo(() => {
    if (status !== 'ready' || messages.length === 0) return null;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role !== 'assistant') return null;
    
    const parts = (lastMsg as any).parts;
    if (parts && Array.isArray(parts)) {
      const suggestionPart = parts.find((p: any) => p.type === 'data-suggestions');
      return suggestionPart?.data || null;
    }
    return null;
  }, [messages, status]);

  const activeSuggestions = dynamicSuggestions || (messages.length < 3 ? SUGGESTED_ACTIONS : null);

  // Roadmap steps for the autonomous loop following AI SDK Elements pattern
  const roadmapSteps = React.useMemo(() => {
    const currentProgress = currentAgentStatus?.progress || 0;

    const getStatus = (targetProgress: number): TaskStatus => {
      if (currentProgress >= targetProgress) return 'completed';
      if (currentProgress > targetProgress - 40) return 'in-progress';
      return 'pending';
    };

    return [
      { label: 'Risk Analysis', status: getStatus(40), details: 'ZK-verified Monte Carlo simulations' },
      { label: 'Strategy Formulation', status: getStatus(80), details: 'Yield scout on Solana & TON' },
      { label: 'Tactical Execution', status: getStatus(100), details: 'ProofVault settlement & rebalance' }
    ];
  }, [currentAgentStatus]);

  // Auto-scroll to bottom on new messages or streaming content if user is near the bottom
  useEffect(() => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100; // 100px threshold
      
      if (isNearBottom) {
        scrollRef.current.scrollTop = scrollHeight;
      }
    }
  }, [messages, isLoading, error]);

  return (
    <div className="flex flex-col h-full w-full rounded-2xl overflow-hidden bg-[#0B0E14]/80 backdrop-blur-xl border border-white/10 shadow-2xl shadow-tether-teal/5 relative">
      {/* Premium Header with Telemetry */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-2.5 sm:py-3 border-b border-white/10 bg-black/20 relative z-10">
        <div className="flex flex-col">
          <h2 className="font-heading text-tether-teal text-[11px] sm:text-sm font-semibold tracking-wider flex items-center gap-2 sm:gap-3">
            <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-tether-teal animate-pulse"></div>
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
            <div className="flex flex-col items-end mr-4 min-w-[100px]">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[7px] font-heading text-tether-teal uppercase tracking-widest animate-pulse">{currentAgentStatus.status}</span>
                <span className="text-[7px] font-mono text-gray-400">{currentAgentStatus.progress}%</span>
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
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
            <span className="hidden sm:inline font-heading text-[10px] tracking-widest">Active</span>
          </div>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <Conversation 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6 scroll-smooth scrollbar-none custom-scrollbar"
      >
        <ChatHistory messages={messages} />
        
        {isLoading && (
          <div className="mx-2 mt-4 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <OperationalPlan steps={roadmapSteps} />
            
            <div className="flex items-center gap-2 text-gray-400 font-sans text-sm animate-pulse ml-2">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-tether-teal)] animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-tether-teal)] animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-tether-teal)] animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              <span className="tracking-widest text-[9px] uppercase font-heading text-[var(--color-tether-teal)]/60 ml-2">
                {currentAgentStatus ? `Strategist: ${currentAgentStatus.status}...` : "Neural Link Active..."}
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
          <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-2 scrollbar-none no-scrollbar px-1 animate-in fade-in slide-in-from-bottom-2 duration-700 delay-300">
            {activeSuggestions.map((action: any) => (
              <button
                key={action.label}
                onClick={() => sendMessage({ text: action.prompt })}
                className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/5 text-[9px] font-heading tracking-widest text-neutral-gray-light hover:bg-tether-teal/10 hover:border-tether-teal/30 hover:text-tether-teal transition-all duration-300"
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
        />
      </div>
    </div>
  );
}
