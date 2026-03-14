import React, { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChatHistory } from './ChatHistory';
import { MessageInput } from './MessageInput';
import { CpuIcon, ZapIcon, ShieldCheckIcon, BarChart3Icon, BrainCircuitIcon } from 'lucide-react';

interface ChatContainerProps {
  messages: any[];
  isLoading?: boolean;
  sendMessage: (msg: string) => Promise<void>;
  data?: any[];
}

const SUGGESTED_ACTIONS = [
  { label: 'Vault Status', icon: BarChart3Icon, prompt: 'Show me the current vault status and buffer utilization.' },
  { label: 'Check Risk', icon: ShieldCheckIcon, prompt: 'What are the current ZK-risk parameters?' },
  { label: 'Pivot Gold', icon: ZapIcon, prompt: 'Simulate a rebalance to Tether Gold (XAU₮).' },
  { label: 'Harvest Yield', icon: CpuIcon, prompt: 'Check for available yield to harvest.' },
];

export function ChatContainer({ messages, sendMessage, isLoading, data }: ChatContainerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Get the latest status from the stream data
  const latestStatus = data?.filter(d => d.type === 'status' || d.type === 'progress').pop();

  // Auto-scroll to bottom on new messages or streaming content
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading, messages.map(m => m.content).join(''), latestStatus]);

  return (
    <div className="flex flex-col h-full w-full rounded-2xl overflow-hidden bg-[#0B0E14]/80 backdrop-blur-xl border border-white/10 shadow-2xl shadow-tether-teal/5 relative">
      {/* Premium Header with Telemetry */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-black/20 relative z-10">
        <div className="flex flex-col">
          <h2 className="font-heading text-tether-teal text-sm font-semibold tracking-wider flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-tether-teal animate-pulse"></div>
            WDK Strategist Terminal
          </h2>
          <div className="flex items-center gap-3 mt-1.5 opacity-60">
            <div className="flex items-center gap-1 text-[8px] font-heading tracking-widest text-neutral-gray-light uppercase">
              <span className="text-cyber-blue">Lat:</span> 24ms
            </div>
            <div className="flex items-center gap-1 text-[8px] font-heading tracking-widest text-neutral-gray-light uppercase">
              <span className="text-neon-green">TPS:</span> 1.4k
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
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
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth scrollbar-none custom-scrollbar"
      >
        <ChatHistory messages={messages} />
        {isLoading && !latestStatus && (
          <div className="flex items-center gap-2 text-gray-400 font-sans text-sm animate-pulse ml-2 mt-4">
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-tether-teal)] animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-tether-teal)] animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-tether-teal)] animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <span className="tracking-widest text-[9px] uppercase font-heading text-[var(--color-tether-teal)]/60 ml-2">Neural Link Active...</span>
          </div>
        )}
      </div>

      {/* Input Anchored Area */}
      <div className="p-4 bg-gradient-to-t from-black/80 via-black/40 to-transparent border-t border-white/5">
        {/* Suggested Actions Chips */}
        {messages.length < 3 && (
          <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-2 scrollbar-none no-scrollbar px-1 animate-in fade-in slide-in-from-bottom-2 duration-700 delay-300">
            {SUGGESTED_ACTIONS.map((action) => (
              <button
                key={action.label}
                onClick={() => sendMessage(action.prompt)}
                className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/5 text-[9px] font-heading tracking-widest text-neutral-gray-light hover:bg-tether-teal/10 hover:border-tether-teal/30 hover:text-tether-teal transition-all duration-300"
              >
                <action.icon className="w-3 h-3" />
                {action.label}
              </button>
            ))}
          </div>
        )}
        
        <MessageInput onSend={sendMessage} disabled={isLoading} />
      </div>
    </div>
  );
}
