import React from 'react';
import { UserIcon, BotIcon, ShieldCheckIcon, TerminalIcon, ActivityIcon, ChevronDownIcon, ChevronUpIcon, BrainCircuitIcon, CheckCircle2Icon, Loader2Icon, WrenchIcon } from 'lucide-react';
import remarkGfm from 'remark-gfm';
import clsx from 'clsx';
import { BalanceCard } from './cards/BalanceCard';
import { Message, MessageContent, MessageResponse } from '../../src/components/ai-elements/message.jsx';
import { Reasoning, ReasoningTrigger, ReasoningContent } from '../../src/components/ai-elements/reasoning.jsx';
import { Tool, ToolHeader, ToolContent, ToolOutput } from '../../src/components/ai-elements/tool.jsx';

interface RichMessageProps {
  role: string;
  content?: any;
  parts?: any[];
  toolInvocations?: any[];
  timestamp?: string | Date;
}

export function RichMessage({ role, content, parts, toolInvocations, timestamp }: RichMessageProps) {
  const isAgent = role === 'assistant';

  // Extract "Thinking" content for the Reasoning component
  const reasoningText = React.useMemo(() => {
    if (!parts) return '';
    const statusParts = parts.filter((p: any) => p.type === 'data-status' || p.type === 'data-notification');
    if (statusParts.length === 0) return '';

    return statusParts.map((p: any) => {
      if (p.type === 'data-status') return `> [${p.data.status}] processing... (progress: ${p.data.progress}%)`;
      if (p.type === 'data-notification') return `> ${p.data.message}`;
      return '';
    }).join('\n');
  }, [parts]);

  // Priority: parts (AI SDK 5.0+) -> content (fallback)
  const textContent = React.useMemo(() => {
    if (parts && Array.isArray(parts)) {
      const text = parts
        .filter((p: any) => p.type === 'text')
        .map((p: any) => p.text)
        .join('');
      if (text) return text;
    }
    
    // Fallback logic for content
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
  }, [parts, content]);

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
    const { toolName, toolCallId, state, result, args } = toolInvocation;
    
    return (
      <Tool key={toolCallId} open={state === 'result'}>
        <ToolHeader 
          title={toolName === 'get_vault_status' ? 'Vault Status Check' : (toolName === 'execute_rebalance' ? 'Tactical Rebalance' : toolName)}
          type="dynamic-tool"
          state={state === 'result' ? 'output-available' : 'input-available'}
          toolName={toolName}
        />
        <ToolContent>
          {args && (
            <div className="mb-2">
              <span className="text-[8px] font-heading text-neutral-gray uppercase tracking-widest block mb-1">Parameters</span>
              <pre className="text-[9px] bg-black/40 p-2 rounded border border-white/5 text-gray-400 font-mono overflow-x-auto">
                {JSON.stringify(args, null, 2)}
              </pre>
            </div>
          )}
          {state === 'result' && (
            <ToolOutput 
              output={toolName === 'get_vault_status' ? <BalanceCard {...result} /> : result}
            />
          )}
        </ToolContent>
      </Tool>
    );
  };

  return (
    <Message from={role} className="animate-in fade-in duration-500">
      <div className={clsx(
        "flex w-full gap-3 md:gap-4",
        !isAgent && "flex-row-reverse"
      )}>
        {/* Avatar Section */}
        <div className="flex-shrink-0 mt-1">
          <div className={clsx(
            "w-8 h-8 md:w-10 md:h-10 rounded-xl flex items-center justify-center border shadow-glow-sm transition-all duration-500 group-hover:scale-110 overflow-hidden",
            isAgent ? "bg-space-black border-tether-teal/30" : "bg-gradient-to-br from-cyber-cyan to-cyber-blue border-white/10 text-space-black"
          )}>
            {isAgent ? (
              <img src="/imgs/mascot-avatar.png" alt="WDK Strategist" className="w-full h-full object-cover" />
            ) : (
              <UserIcon className="w-4 h-4 md:w-5 md:h-5" />
            )}
          </div>
        </div>

        {/* Content Section */}
        <div className={clsx("flex flex-col gap-1.5 min-w-0 flex-1", !isAgent && "items-end text-right")}>
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

          <MessageContent className={clsx(
            "relative border backdrop-blur-md transition-all duration-300 rounded-2xl md:rounded-3xl p-3 sm:p-4 md:p-5",
            isAgent 
              ? "bg-[#1E2329]/40 border-white/10 text-gray-100 rounded-tl-none" 
              : "bg-gradient-to-br from-tether-teal/10 to-transparent border-tether-teal/20 text-white rounded-tr-none shadow-glow-sm"
          )}>
            {isAgent && reasoningText && (
              <Reasoning isStreaming={textContent === ''}>
                <ReasoningTrigger />
                <ReasoningContent>
                  {reasoningText}
                </ReasoningContent>
              </Reasoning>
            )}

            <div className="prose prose-invert prose-xs md:prose-sm max-w-none prose-p:leading-relaxed prose-code:text-tether-teal prose-code:bg-space-black/50 prose-code:px-1 prose-code:rounded prose-pre:bg-space-black prose-pre:border prose-pre:border-white/5">
              <MessageResponse>
                {textContent}
              </MessageResponse>
            </div>

            {toolInvocations && toolInvocations.length > 0 && (
              <div className="mt-4 space-y-3">
                {toolInvocations.map(renderToolCard)}
              </div>
            )}
          </MessageContent>
        </div>
      </div>
    </Message>
  );
}
