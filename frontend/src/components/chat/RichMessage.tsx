import React, { useMemo } from 'react';
import { 
  UserIcon, 
  ShieldCheckIcon, 
  BrainCircuitIcon, 
  ZapIcon, 
  BarChart3Icon,
  ChevronRightIcon,
  InfoIcon,
  AlertTriangleIcon,
  CheckCircle2Icon
} from 'lucide-react';
import clsx from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';
import { BalanceCard } from './cards/BalanceCard';
import { Message, MessageContent, MessageResponse } from '../ai-elements/Message';
import { Reasoning, ReasoningTrigger, ReasoningContent, ReasoningRawContent } from '../ai-elements/Reasoning';
import { Tool, ToolHeader, ToolContent, ToolInput, ToolOutput } from '../ai-elements/Tool';
import { useToolTitles, getToolTitle } from '@/hooks/useToolTitles';

interface RichMessageProps {
  role: string;
  content?: any;
  parts?: any[];
  toolInvocations?: any[];
  timestamp?: string | Date;
  isStreaming?: boolean;
  addToolOutput?: (output: any) => void;
}

export function RichMessage({ role, content, parts, toolInvocations, timestamp, isStreaming = false, addToolOutput }: RichMessageProps) {
  const isAgent = role === 'assistant';
  const { titles } = useToolTitles();

  const getFormattedTime = () => {
    if (!timestamp) return '';
    try {
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) return '';
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return '';
    }
  };

  const renderToolInvocation = (part: any) => {
    const { toolCallId, toolName, state, args, input, output, result } = part;

    let toolState: string = 'input-available';
    
    if (state === 'result' || state === 'output-available') {
      toolState = 'output-available';
    } else if (state === 'output-error' || part.error) {
      toolState = 'output-error';
    } else if (state === 'input-streaming') {
      toolState = 'input-streaming';
    } else if (state === 'call' || state === 'tool-call') {
      toolState = 'input-available';
    }

    const title = getToolTitle(titles, toolName);
    const isCompleted = toolState === 'output-available' || toolState === 'output-error';
    const hasError = toolState === 'output-error';
    const isPending = toolState === 'input-streaming';

    return (
      <Tool key={toolCallId} defaultOpen={!isCompleted} className="border-white/5 bg-white/5">
        <ToolHeader 
          toolName={toolName} 
          title={title} 
          state={toolState} 
          type={part.type}
        />
        <ToolContent>
          {/* Render tool input/args - for both pending and completed states */}
          {(args && Object.keys(args).length > 0) || (input && Object.keys(input).length > 0) ? (
            <ToolInput input={input || args || {}} />
          ) : isPending ? (
            <div className="flex items-center gap-2 p-3 text-[10px] text-neutral-gray">
              <div className="w-2 h-2 rounded-full bg-cyber-cyan animate-pulse" />
              Collecting parameters...
            </div>
          ) : null}
          
          {isCompleted && (
            <>
              {toolName === 'get_vault_status' ? (
                <div className="mt-2">
                   <BalanceCard {...result} />
                </div>
              ) : toolName === 'analyze_risk' ? (
                <div className="space-y-3 mt-2">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-3 rounded-xl bg-black/20 border border-white/5 text-center">
                      <span className="text-[8px] font-heading text-neutral-gray uppercase block mb-1">Risk Level</span>
                      <span className={clsx(
                        "text-lg font-heading font-bold",
                        result?.level === 'HIGH' ? "text-red-400" : result?.level === 'MEDIUM' ? "text-yellow-400" : "text-tether-teal"
                      )}>
                        {result?.level || 'N/A'}
                      </span>
                    </div>
                    <div className="p-3 rounded-xl bg-black/20 border border-white/5 text-center">
                      <span className="text-[8px] font-heading text-neutral-gray uppercase block mb-1">Drawdown</span>
                      <span className="text-lg font-heading font-bold text-cyber-cyan">
                        {result?.drawdownBps || 0} bps
                      </span>
                    </div>
                    <div className="p-3 rounded-xl bg-black/20 border border-white/5 text-center">
                      <span className="text-[8px] font-heading text-neutral-gray uppercase block mb-1">Sharpe</span>
                      <span className="text-lg font-heading font-bold text-bnb-gold">
                        {result?.sharpe || 0}
                      </span>
                    </div>
                  </div>
                  {result?.message && (
                    <div className="p-3 rounded-xl bg-tether-teal/5 border border-tether-teal/20">
                      <span className="text-[9px] font-mono text-tether-teal">{result.message}</span>
                    </div>
                  )}
                </div>
              ) : toolName === 'get_all_chain_balances' ? (
                <div className="mt-2 space-y-2">
                  {result.balances?.map((chain: any, i: number) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-black/20 border border-white/5">
                      <span className="text-[10px] font-heading uppercase text-neutral-gray">{chain.chain}</span>
                      <span className="text-[10px] font-mono text-tether-teal">{chain.native} {chain.symbol}</span>
                    </div>
                  ))}
                  {result.total && (
                    <div className="flex items-center justify-between p-2 rounded-lg bg-tether-teal/10 border border-tether-teal/30">
                      <span className="text-[10px] font-heading uppercase text-tether-teal">Total</span>
                      <span className="text-[10px] font-mono font-bold text-tether-teal">{result.total}</span>
                    </div>
                  )}
                </div>
              ) : toolName === 'check_risk' ? (
                 <div className="grid grid-cols-2 gap-3 mt-2">
                    <div className="p-3 rounded-xl bg-black/20 border border-white/5">
                      <span className="text-[8px] font-heading text-neutral-gray uppercase block mb-1">ZK Drawdown</span>
                      <span className={clsx(
                        "text-lg font-heading font-bold",
                        result.onChainProfile.level === 'HIGH' ? "text-red-400" : "text-tether-teal"
                      )}>
                        {(result.onChainProfile.drawdownBps / 100).toFixed(2)}%
                      </span>
                    </div>
                    <div className="p-3 rounded-xl bg-black/20 border border-white/5">
                      <span className="text-[8px] font-heading text-neutral-gray uppercase block mb-1">AI Risk Score</span>
                      <span className="text-lg font-heading font-bold text-cyber-cyan">
                        {result.aiRiskScore}/100
                      </span>
                    </div>
                    <div className="col-span-2 p-3 rounded-xl bg-black/20 border border-white/5">
                      <span className="text-[8px] font-heading text-neutral-gray uppercase block mb-1">Strategist Note</span>
                      <p className="text-[10px] text-gray-300 leading-relaxed italic">"{result.aiExplanation}"</p>
                    </div>
                 </div>
              ) : (
                <ToolOutput output={output || result} errorText={hasError ? (result?.error || 'Tool execution failed') : undefined} />
              )}
            </>
          )}

          {/* Confirmation UI if tool needs interaction */}
          {toolName === 'execute_rebalance' && state === 'call' && (
            <div className="mt-4 p-4 rounded-xl bg-cyber-cyan/5 border border-cyber-cyan/20 flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-cyber-cyan/20 text-cyber-cyan">
                  <AlertTriangleIcon className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-[10px] font-heading font-bold uppercase tracking-widest text-white">Confirmation Required</h4>
                  <p className="text-[9px] text-neutral-gray-light leading-relaxed">System is ready to shift capital rails. Proceed with settlement?</p>
                </div>
              </div>
              <div className="flex gap-2 mt-1">
                <button 
                  onClick={() => addToolOutput?.({ toolCallId, output: { confirmed: true } })}
                  className="flex-1 py-2 rounded-lg bg-cyber-cyan text-space-black text-[9px] font-heading font-bold uppercase tracking-widest hover:bg-cyber-cyan/80 transition-all cursor-pointer"
                >
                  Approve & Execute
                </button>
                <button 
                  onClick={() => addToolOutput?.({ toolCallId, output: { confirmed: false } })}
                  className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-[9px] font-heading font-bold text-neutral-gray hover:bg-white/10 transition-all cursor-pointer"
                >
                  Abort
                </button>
              </div>
            </div>
          )}
        </ToolContent>
      </Tool>
    );
  };

  const renderPart = (part: any, index: number) => {
    switch (part.type) {
      case 'text':
        return (
          <div key={index} className="prose prose-invert prose-xs md:prose-sm max-w-none prose-p:leading-relaxed prose-strong:text-tether-teal prose-code:text-cyber-cyan prose-code:bg-space-black/50 prose-code:px-1 prose-code:rounded prose-pre:bg-space-black prose-pre:border prose-pre:border-white/5">
            <MessageResponse>{part.text}</MessageResponse>
          </div>
        );

      case 'step-start':
        return index > 0 ? (
          <div key={index} className="text-neutral-gray py-2 opacity-40">
            <div className="flex items-center gap-2">
              <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
              <span className="text-[8px] font-mono uppercase tracking-widest">Step {index + 1}</span>
              <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
            </div>
          </div>
        ) : null;

      case 'reasoning':
        if (!part.reasoning || !String(part.reasoning).trim()) return null;
        return (
          <Reasoning key={index} isStreaming={isStreaming}>
            <ReasoningTrigger />
            <ReasoningContent>
              <span className="italic text-gray-400">{part.reasoning}</span>
            </ReasoningContent>
          </Reasoning>
        );

      default:
        if (part.type === 'tool-invocation' || part.type?.startsWith('tool-') || part.type === 'dynamic-tool') {
          return renderToolInvocation(part);
        }
        return null;
    }
  };

  return (
    <Message from={role}>
      <div className={clsx(
        "flex w-full gap-3 md:gap-4",
        !isAgent && "flex-row-reverse"
      )}>
        {/* Avatar Section */}
        <div className="flex-shrink-0 mt-1">
          <div className={clsx(
            "w-8 h-8 md:w-10 md:h-10 rounded-xl flex items-center justify-center border shadow-glow-sm overflow-hidden",
            isAgent ? "bg-space-black border-tether-teal/30" : "bg-gradient-to-br from-cyber-cyan to-cyber-blue border-white/10 text-space-black"
          )}>
            {isAgent ? (
              <img src="/imgs/mascot-owl-no-bg.png" alt="AFOS Strategist" className="w-full h-full object-contain" />
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
              <span className="text-[9px] font-mono text-neutral-gray opacity-40 lowercase tracking-tighter">
                [{getFormattedTime()}]
              </span>
            )}
          </div>

          <MessageContent className={clsx(
            "relative border backdrop-blur-md transition-all duration-300 rounded-2xl md:rounded-3xl p-3 sm:p-4 md:p-5 shadow-2xl",
            isAgent 
              ? "bg-[#1E2329]/40 border-white/10 text-gray-100 rounded-tl-none" 
              : "bg-gradient-to-br from-tether-teal/10 to-transparent border-tether-teal/20 text-white rounded-tr-none shadow-glow-sm"
          )}>
            {/* Render Parts (v5 standard) */}
            {parts && parts.length > 0 ? (
              parts.map(renderPart)
            ) : (
              /* Fallback for content string or legacy toolInvocations */
              <div className="space-y-4">
                <div className="prose prose-invert prose-xs md:prose-sm max-w-none prose-p:leading-relaxed">
                  <MessageResponse>
                    {typeof content === 'string' ? content : JSON.stringify(content)}
                  </MessageResponse>
                </div>
                {toolInvocations && toolInvocations.map((ti, i) => renderToolInvocation({ ...ti, type: 'tool-invocation' }))}
              </div>
            )}
          </MessageContent>
        </div>
      </div>
    </Message>
  );
}
