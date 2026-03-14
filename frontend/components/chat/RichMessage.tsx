import React from 'react';
import { UserIcon, BotIcon, ShieldCheckIcon, TerminalIcon, ActivityIcon } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { clsx } from 'clsx';
import { motion } from 'framer-motion';
import { SwapCard } from './cards/SwapCard';
import { BridgeCard } from './cards/BridgeCard';
import { DepositCard } from './cards/DepositCard';
import { ExecutionChecklist, ExecutionStep } from './ExecutionChecklist';

interface RichMessageProps {
  role: string;
  content: string;
  toolInvocations?: any[];
  timestamp?: string | Date;
}

export function RichMessage({ role, content, toolInvocations, timestamp }: RichMessageProps) {
  const isAgent = role === 'assistant';
  
  // Ensure content is a string for ReactMarkdown
  const displayContent = React.useMemo(() => {
    if (!content) return '';
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .map(part => {
          if (typeof part === 'string') return part;
          if (part && typeof part === 'object' && 'text' in part) return part.text;
          return '';
        })
        .join('');
    }
    return String(content);
  }, [content]);

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

  const formattedTime = getFormattedTime();

  const renderToolCard = (toolInvocation: any) => {
    if (!toolInvocation) return null;
    const { toolName, state, args, result } = toolInvocation;
    const isResult = state === 'result';
    const data = isResult ? { ...args, ...result } : args;

    if (!data) return null;

    // Mapping tool names to specialized cards
    switch (toolName) {
      case 'execute_swap':
      case 'swap_assets':
        return (
          <SwapCard 
            input={{ amount: data.inputAmount || data.amount, symbol: data.inputSymbol || data.fromToken, logo: `/coins/${(data.inputSymbol || data.fromToken || '').toLowerCase()}.png` }}
            output={{ amount: data.outputAmount || '0.00', symbol: data.outputSymbol || data.toToken, logo: `/coins/${(data.outputSymbol || data.toToken || '').toLowerCase()}.png` }}
            route={data.route || 'Aggregator'}
            slippage={data.slippage || '0.5'}
            txHash={data.txHash}
          />
        );
      
      case 'bridge_assets':
      case 'cross_chain_transfer':
        return (
          <BridgeCard 
            asset={{ amount: data.amount, symbol: data.symbol, logo: `/coins/${(data.symbol || '').toLowerCase()}.png` }}
            fromChain={{ name: data.fromChain, logo: `/coins/${(data.fromChain || '').toLowerCase()}.png` }}
            toChain={{ name: data.toChain, logo: `/coins/${(data.toChain || '').toLowerCase()}.png` }}
            estimatedTime={data.estimatedTime || '5-10 min'}
            txHash={data.txHash}
          />
        );

      case 'deposit_yield':
      case 'stake_assets':
        return (
          <DepositCard 
            asset={{ amount: data.amount, symbol: data.symbol, logo: `/coins/${(data.symbol || '').toLowerCase()}.png` }}
            protocol={{ name: data.protocol, apy: data.apy || '0.00', logo: `/coins/${(data.protocol || '').toLowerCase()}.png` }}
            riskLevel={data.riskLevel || 'LOW'}
            txHash={data.txHash}
          />
        );

      case 'strategy_execution':
      case 'complex_action':
        return (
          <ExecutionChecklist 
            title={data.strategyTitle || 'Executing Strategy'} 
            steps={data.steps || []} 
          />
        );

      default:
        // Generic Tool Rendering (Enhanced)
        return (
          <div className="bg-black/40 rounded-xl p-4 border border-white/10 shadow-inner overflow-hidden">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                {isResult ? (
                  <ShieldCheckIcon className="w-4 h-4 text-tether-teal" />
                ) : (
                  <div className="relative">
                    <ActivityIcon className="w-4 h-4 text-cyber-cyan animate-spin" />
                  </div>
                )}
                <span className="font-heading text-[10px] text-tether-teal tracking-wider uppercase">
                  PROCESS: {toolName.replace(/_/g, ' ')}
                </span>
              </div>
              <span className={clsx(
                "text-[8px] px-2 py-0.5 rounded-full border font-bold",
                isResult ? "bg-neon-green/10 border-neon-green/20 text-neon-green" : "bg-cyber-cyan/10 border-cyber-cyan/20 text-cyber-cyan"
              )}>
                {state.toUpperCase()}
              </span>
            </div>

            {/* Progress Line for active tools */}
            {!isResult && (
              <div className="mb-4 h-1 w-full bg-white/5 rounded-full overflow-hidden">
                <motion.div 
                  className="h-full bg-tether-teal"
                  animate={{ x: ['-100%', '100%'] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                />
              </div>
            )}

            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-1.5 opacity-50">
                <TerminalIcon className="w-3 h-3" />
                <span className="text-[9px] font-heading tracking-widest uppercase">Parameters</span>
              </div>
              <pre className="text-[10px] bg-black/30 p-2 rounded-lg border border-white/5 font-mono text-gray-400 overflow-x-auto">
                {JSON.stringify(args, null, 2)}
              </pre>
            </div>

            {isResult && result && (
              <div className="mt-3 pt-3 border-t border-white/5 animate-in fade-in slide-in-from-top-1 duration-500">
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(result).slice(0, 4).map(([key, value]) => (
                    <div key={key} className="bg-white/5 p-2 rounded-lg border border-white/5">
                      <div className="text-neutral-gray uppercase tracking-wider text-[8px] font-heading">{key}</div>
                      <div className="text-gray-200 font-mono text-[10px] mt-0.5 truncate">{String(value)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
    }
  };

  return (
    <div className={`flex w-full ${isAgent ? 'justify-start' : 'justify-end'} group mb-4 last:mb-0`}>
      <div className={`flex gap-4 max-w-[85%] ${isAgent ? 'flex-row' : 'flex-row-reverse'}`}>
        
        {/* Identity Avatar */}
        <div className="flex-shrink-0 mt-1">
          <div className={`w-10 h-10 flex items-center justify-center backdrop-blur-sm border overflow-hidden ${
            isAgent 
              ? 'rounded-full bg-tether-teal/10 border-tether-teal/30 text-tether-teal shadow-[0_0_10px_rgba(38,161,123,0.2)]' 
              : 'rounded-xl bg-white/5 border-white/10 text-gray-300'
          }`}>
            {isAgent ? (
              <img src="/imgs/mascot-avatar.png" alt="WDK Strategist" className="w-full h-full object-cover" />
            ) : (
              <UserIcon className="w-6 h-6" />
            )}
          </div>
        </div>

        {/* Message Bubble */}
        <div className={`flex flex-col gap-1 ${isAgent ? 'items-start' : 'items-end'}`}>
          <div className="flex items-center gap-2 px-1">
            <span className="font-heading text-[10px] tracking-wider text-gray-400">
              {isAgent ? 'WDK STRATEGIST' : 'COMMANDER'}
            </span>
            {formattedTime && <span className="text-[10px] text-gray-600 font-sans">{formattedTime}</span>}
          </div>
          
          <div className={`relative px-5 py-3.5 rounded-2xl font-sans text-sm leading-relaxed shadow-lg ${
            isAgent 
              ? 'bg-white/5 border border-white/10 text-gray-200 rounded-tl-sm' 
              : 'bg-gradient-to-br from-tether-teal/20 to-tether-teal/5 border border-tether-teal/20 text-gray-100 rounded-tr-sm'
          }`}>
            
            {/* Markdown Body */}
            {displayContent && (
              <div className="prose prose-invert prose-sm prose-p:leading-relaxed prose-pre:bg-black/50 prose-pre:border prose-pre:border-white/10 max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayContent}</ReactMarkdown>
              </div>
            )}

            {/* Tool Invocations Rendering */}
            {toolInvocations && toolInvocations.length > 0 && (
              <div className={clsx("space-y-4", displayContent ? "mt-4 pt-4 border-t border-white/10" : "")}>
                {toolInvocations.map((toolInvocation) => (
                  <div key={toolInvocation.toolCallId}>
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
