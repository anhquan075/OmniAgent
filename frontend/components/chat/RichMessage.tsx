import React from 'react';
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
import { Message, MessageContent, MessageResponse } from '../../src/components/ai-elements/Message';
import { Reasoning, ReasoningTrigger, ReasoningContent } from '../../src/components/ai-elements/Reasoning';
import { Tool, ToolHeader, ToolContent, ToolOutput } from '../../src/components/ai-elements/Tool';

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
    const { toolCallId, toolName, state, args } = part;
    const result = part.result;

    const toolTitles: Record<string, string> = {
      get_vault_status: 'Vault Analytics',
      check_risk: 'ZK Risk Proof',
      execute_rebalance: 'Tactical Rebalance',
      execute_syndicate_payout: 'Syndicate Payout',
      x402_payment: 'x402 Settlement'
    };

    const toolIcons: Record<string, any> = {
      get_vault_status: BarChart3Icon,
      check_risk: ShieldCheckIcon,
      execute_rebalance: ZapIcon,
      execute_syndicate_payout: BrainCircuitIcon,
      x402_payment: ZapIcon
    };

    const ToolIcon = toolIcons[toolName] || BrainCircuitIcon;

    return (
      <div key={toolCallId} className="my-4 group">
        <div className={clsx(
          "glass rounded-2xl overflow-hidden border transition-all duration-500",
          state === 'result' ? "border-tether-teal/30 bg-tether-teal/5" : "border-white/10 bg-white/5 shadow-glow-sm"
        )}>
          {/* Tool Header */}
          <div className="px-4 py-3 flex items-center justify-between border-b border-white/5 bg-white/5">
            <div className="flex items-center gap-3">
              <div className={clsx(
                "p-1.5 rounded-lg",
                state === 'result' ? "bg-tether-teal/20 text-tether-teal" : "bg-white/10 text-neutral-gray-light"
              )}>
                <ToolIcon className="w-4 h-4" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-heading font-bold tracking-widest uppercase">
                  {toolTitles[toolName] || toolName}
                </span>
                <span className="text-[8px] font-mono opacity-40 uppercase tracking-tighter">
                  ID: {toolCallId.slice(0, 8)}
                </span>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {state === 'call' && (
                <div className="flex items-center gap-2 px-2 py-1 rounded-full bg-cyber-cyan/10 border border-cyber-cyan/20">
                  <motion.div 
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                    className="w-2 h-2 rounded-full border-t-2 border-cyber-cyan"
                  />
                  <span className="text-[8px] font-heading text-cyber-cyan uppercase tracking-widest">Executing</span>
                </div>
              )}
              {state === 'result' && (
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-tether-teal/10 border border-tether-teal/20">
                  <CheckCircle2Icon className="w-2 h-2 text-tether-teal" />
                  <span className="text-[8px] font-heading text-tether-teal uppercase tracking-widest">Complete</span>
                </div>
              )}
            </div>
          </div>

          {/* Tool Content */}
          <div className="p-4">
            {/* Show arguments if in call state */}
            {state === 'call' && args && Object.keys(args).length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-neutral-gray-light">
                  <ChevronRightIcon className="w-3 h-3" />
                  <span className="text-[9px] font-heading uppercase tracking-widest">Input Parameters</span>
                </div>
                <pre className="text-[10px] bg-black/40 p-3 rounded-xl border border-white/5 text-gray-400 font-mono overflow-x-auto">
                  {JSON.stringify(args, null, 2)}
                </pre>
              </div>
            )}

            {/* Show Result */}
            {state === 'result' && (
              <div className="animate-in fade-in slide-in-from-top-2 duration-500">
                {toolName === 'get_vault_status' && <BalanceCard {...result} />}
                
                {toolName === 'check_risk' && (
                  <div className="grid grid-cols-2 gap-3">
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
                )}

                {toolName !== 'get_vault_status' && toolName !== 'check_risk' && (
                  <pre className="text-[10px] bg-black/40 p-3 rounded-xl border border-white/5 text-tether-teal font-mono overflow-x-auto">
                    {JSON.stringify(result, null, 2)}
                  </pre>
                )}
              </div>
            )}

            {/* Confirmation UI if tool needs interaction (not in result state and is execute_rebalance) */}
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
          </div>
        </div>
      </div>
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
      
      case 'reasoning':
        return (
          <Reasoning key={index} isStreaming={isStreaming}>
            <ReasoningTrigger />
            <ReasoningContent>
              {part.reasoning}
            </ReasoningContent>
          </Reasoning>
        );

      case 'tool-invocation':
        return renderToolInvocation(part);

      default:
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
