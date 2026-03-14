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
  console.log("[ChatHistory] Rendering with messages:", Array.isArray(messages) ? messages.length : 'not an array');
  return (
    <div className="flex flex-col space-y-2 border-2 border-cyan-500 min-h-[100px]">
      {messages.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-center space-y-5 my-auto mt-24 opacity-80">
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-tether-teal/20 to-transparent border border-tether-teal/30 flex items-center justify-center shadow-[0_0_30px_rgba(38,161,123,0.1)] overflow-hidden">
            <img src="/imgs/mascot-avatar.png" alt="WDK Strategist" className="w-full h-full object-cover" />
          </div>
          <div className="font-heading tracking-widest text-sm text-tether-teal">SYSTEM ONLINE</div>
          <p className="font-sans text-xs text-gray-400 max-w-xs leading-relaxed">
            Initialize your ProofVault operations via WDK. Ask for vault status, execute cross-chain strategies, or check risk parameters.
          </p>
        </div>
      ) : (
        messages.map((msg, index) => {
          // Message grouping logic for tighter UI layout
          const isFirstInGroup = index === 0 || messages[index - 1].role !== msg.role;
          
          return (
            <div key={msg.id} className={isFirstInGroup ? 'mt-6' : 'mt-1'}>
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
