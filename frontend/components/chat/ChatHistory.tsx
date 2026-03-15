import React from 'react';
import { RichMessage } from './RichMessage';
import { SparklesIcon } from 'lucide-react';

interface Message {
  id: string;
  role: string;
  content: any;
  toolInvocations?: any[];
  createdAt?: string | Date;
}

interface ChatHistoryProps {
  messages: Message[];
}

export function ChatHistory({ messages = [] }: ChatHistoryProps) {
  // Filter out data-only messages that don't have text content or tool invocations
  const visibleMessages = messages.filter(msg => {
    // Always show user messages immediately
    if (msg.role === 'user') return true;
    
    // Skip internal AI SDK data messages
    if (msg.role === 'data') return false;
    
    // Always show messages with tool invocations
    if (msg.toolInvocations && msg.toolInvocations.length > 0) return true;
    
    // Check if there is any text content (for string content)
    if (msg.content && typeof msg.content === 'string' && msg.content.trim().length > 0) return true;
    
    // Check for parts that have text (for UIMessage parts)
    if ((msg as any).parts && Array.isArray((msg as any).parts)) {
      return (msg as any).parts.some((p: any) => p.type === 'text' && p.text && p.text.trim().length > 0);
    }
    
    return false;
  });

  return (
    <div className="flex flex-col space-y-2 border-2 border-cyan-500 min-h-[100px]">
      {visibleMessages.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-center space-y-5 my-auto mt-24 opacity-80">
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-tether-teal/20 to-transparent border border-tether-teal/30 flex items-center justify-center shadow-[0_0_30px_rgba(38,161,123,0.1)] overflow-hidden">
            <img src="/imgs/mascot-avatar.png" alt="WDK Strategist" className="w-full h-full object-cover" />
          </div>
          <div className="font-heading tracking-widest text-sm text-tether-teal">SYSTEM ONLINE</div>
          <p className="font-sans text-xs text-gray-400 max-w-xs leading-relaxed">
            Initialize your WDKVault operations via WDK. Ask for vault status, execute cross-chain strategies, or check risk parameters.
          </p>
        </div>
      ) : (
        visibleMessages.map((msg, index) => {
          // Message grouping logic for tighter UI layout
          const isFirstInGroup = index === 0 || visibleMessages[index - 1].role !== msg.role;
          
          return (
            <div key={msg.id} className={isFirstInGroup ? 'mt-4 sm:mt-6' : 'mt-1'}>
              <RichMessage 
                role={msg.role} 
                content={msg.content} 
                parts={(msg as any).parts}
                toolInvocations={msg.toolInvocations}
                timestamp={msg.createdAt}
              />
            </div>
          );
        })
      )}
    </div>
  );
}
