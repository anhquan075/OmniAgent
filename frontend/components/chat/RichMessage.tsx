import React, { useEffect } from 'react';
import { UserIcon, BotIcon, ShieldCheckIcon, TerminalIcon, ActivityIcon } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import clsx from 'clsx';
import { BalanceCard } from './cards/BalanceCard';
import { SwapCard } from './cards/SwapCard';
import { BridgeCard } from './cards/BridgeCard';
import { DepositCard } from './cards/DepositCard';
import { ExecutionChecklist, ExecutionStep } from './ExecutionChecklist';

interface RichMessageProps {
  role: string;
  content?: any;
  parts?: any[];
  toolInvocations?: any[];
  timestamp?: string | Date;
}

export function RichMessage({ role, content, parts, toolInvocations, timestamp }: RichMessageProps) {
  const isAgent = role === 'assistant';
  
  // Ensure content is a string for ReactMarkdown (Fallback)
  const displayContent = React.useMemo(() => {
    try {
      if (!content) return '';
      if (typeof content === 'string') return content;
      if (Array.isArray(content)) {
        return content
          .map(part => {
            if (typeof part === 'string') return part;
            if (part && typeof part === 'object' && 'text' in part) return String(part.text);
            return '';
          })
          .join('');
      }
      return String(content);
    } catch (e) {
      console.error("[RichMessage] displayContent error:", e);
      return 'Error rendering message content';
    }
  }, [content]);

  const getFormattedTime = () => {
    if (!timestamp) return '';
    try {
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) return '';
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch (e) {
      return '';
    }
  };

  const renderToolCard = (toolInvocation: any) => {
    const { toolName, toolCallId, state, result } = toolInvocation;
    
    // Logic for rendering specific tool UI based on result/state
    if (state === 'result' || state === 'output-available') {
      const data = typeof result === 'string' ? (result.startsWith('{') ? JSON.parse(result) : result) : result;
      
      switch (toolName) {
        case 'get_vault_status':
          return <BalanceCard key={toolCallId} {...data} />;
        case 'execute_rebalance':
          return (
            <div key={toolCallId} className="p-3 rounded-xl bg-neon-green/10 border border-neon-green/20 text-[10px] font-mono">
              <div className="text-neon-green font-bold mb-1 uppercase tracking-widest">REBALANCE INITIATED</div>
              <div className="text-gray-400 break-all">{data}</div>
            </div>
          );
        default:
          return (
            <div key={toolCallId} className="p-3 rounded-xl bg-white/5 border border-white/10 text-[9px] font-mono">
              <div className="text-tether-teal font-bold mb-1 uppercase tracking-widest">{toolName} Result</div>
              <pre className="text-gray-400 whitespace-pre-wrap">{JSON.stringify(data, null, 2)}</pre>
            </div>
          );
      }
    }
    
    // Loading/Calling state
    return (
      <div key={toolCallId} className="flex items-center gap-2 p-3 rounded-xl bg-white/5 border border-white/10 animate-pulse">
        <ActivityIcon className="w-3 h-3 text-tether-teal" />
        <span className="text-[9px] font-heading font-bold text-neutral-gray uppercase tracking-widest">Executing {toolName}...</span>
      </div>
    );
  };

  return (
    <div className={clsx(
      "flex w-full group animate-in fade-in duration-500",
      isAgent ? "justify-start" : "justify-end"
    )}>
      <div className={clsx(
        "flex max-w-[85%] md:max-w-[75%] gap-3 md:gap-4",
        !isAgent && "flex-row-reverse"
      )}>
        {/* Avatar/Icon Section */}
        <div className="flex-shrink-0 mt-1">
          <div className={clsx(
            "w-8 h-8 md:w-10 md:h-10 rounded-xl flex items-center justify-center border shadow-glow-sm transition-all duration-500 group-hover:scale-110 overflow-hidden",
            isAgent
              ? "bg-space-black border-tether-teal/30"
              : "bg-gradient-to-br from-cyber-cyan to-cyber-blue border-white/10 text-space-black"
          )}>
            {isAgent ? (
              <img src="/imgs/mascot-avatar.png" alt="WDK Strategist" className="w-full h-full object-cover" />
            ) : (
              <UserIcon className="w-4 h-4 md:w-5 md:h-5" />
            )}
          </div>
        </div>
        {/* Message Content Section */}
        <div className={clsx(
          "flex flex-col gap-1.5",
          !isAgent && "items-end text-right"
        )}>
          {/* Metadata Header */}
          <div className="flex items-center gap-3 px-1">
            <span className="text-[10px] font-heading font-bold tracking-widest text-neutral-gray-light uppercase">
              {isAgent ? "AFOS STRATEGIST" : "COMMANDER"}
            </span>
            {timestamp && (
              <span className="text-[9px] font-mono text-neutral-gray opacity-40 lowercase">
                [{getFormattedTime()}]
              </span>
            )}
          </div>

          {/* Chat Bubble Container */}
          <div className={clsx(
            "relative px-4 py-3 md:px-5 md:py-4 rounded-2xl md:rounded-3xl border backdrop-blur-md transition-all duration-300",
            isAgent 
              ? "bg-[#1E2329]/40 border-white/10 text-gray-100 rounded-tl-none shadow-xl group-hover:bg-[#1E2329]/60" 
              : "bg-gradient-to-br from-tether-teal/10 to-transparent border-tether-teal/20 text-white rounded-tr-none shadow-glow-sm group-hover:from-tether-teal/20"
          )}>
            {/* Main Message Body */}
            <div className="prose prose-invert prose-xs md:prose-sm max-w-none prose-p:leading-relaxed prose-code:text-tether-teal prose-code:bg-space-black/50 prose-code:px-1 prose-code:rounded prose-pre:bg-space-black prose-pre:border prose-pre:border-white/5">
              {parts && Array.isArray(parts) ? (
                parts.map((part, index) => {
                  if (part.type === 'text') {
                    return (
                      <ReactMarkdown key={index} remarkPlugins={[remarkGfm]}>
                        {part.text}
                      </ReactMarkdown>
                    );
                  }
                  return null;
                })
              ) : (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {displayContent}
                </ReactMarkdown>
              )}
            </div>

            {/* Tool Invocations Rendering */}
            {toolInvocations && toolInvocations.length > 0 && (
              <div className={clsx("space-y-4", (displayContent || (parts && parts.length > 0)) ? "mt-4 pt-4 border-t border-white/10" : "")}>
                {toolInvocations.map((toolInvocation, idx) => (
                  <div key={toolInvocation.toolCallId || `tool-${idx}`}>
                    {renderToolCard(toolInvocation)}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
