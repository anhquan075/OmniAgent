import React from 'react';
import { MessageSquareIcon, PlusIcon, Trash2Icon, ClockIcon } from 'lucide-react';

interface ChatSession {
  id: string;
  title: string;
  lastMessage: string;
  timestamp: Date;
}

interface ChatHistorySidebarProps {
  sessions: ChatSession[];
  activeSessionId: string;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
  onDeleteSession: (id: string) => void;
}

export function ChatHistorySidebar({ 
  sessions, 
  activeSessionId, 
  onSelectSession, 
  onNewChat,
  onDeleteSession 
}: ChatHistorySidebarProps) {
  return (
    <div className="flex flex-col h-full bg-space-black/40 border-r border-white/5 w-full transition-all duration-300">
      {/* New Chat Button Area */}
      <div className="p-6 pb-4">
        <button
          onClick={onNewChat}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-tether-teal text-space-black font-heading text-[10px] tracking-widest font-bold hover:bg-tether-teal/90 transition-all shadow-glow-sm hover:shadow-glow-md"
        >
          <PlusIcon className="w-4 h-4" />
          NEW SESSION
        </button>
      </div>

      {/* Sessions List Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-6 space-y-1 pb-4">
        <div className="mb-4">
          <span className="text-[9px] font-heading text-neutral-gray uppercase tracking-[0.2em]">Recent Commands</span>
        </div>
        
        {sessions.length === 0 ? (
          <div className="py-8 text-center">
            <MessageSquareIcon className="w-8 h-8 text-neutral-gray/20 mx-auto mb-2" />
            <p className="text-[10px] text-neutral-gray font-sans">No recent sessions</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sessions.map((session) => (
              <div
                key={session.id}
                className={`group relative flex items-center gap-3 p-3.5 rounded-xl cursor-pointer transition-all border ${
                  activeSessionId === session.id
                    ? 'bg-white/5 border-white/10 shadow-inner'
                    : 'bg-transparent border-transparent hover:bg-white/[0.03] hover:border-white/5'
                }`}
                onClick={() => onSelectSession(session.id)}
              >
                <div className={`p-2 rounded-lg transition-colors ${activeSessionId === session.id ? 'bg-tether-teal/20 text-tether-teal' : 'bg-white/5 text-neutral-gray group-hover:text-neutral-gray-light'}`}>
                  <ClockIcon className="w-3.5 h-3.5" />
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className={`text-[11px] font-medium truncate mb-0.5 ${activeSessionId === session.id ? 'text-white' : 'text-neutral-gray-light group-hover:text-white'}`}>
                    {session.title}
                  </div>
                  <div className="text-[9px] text-neutral-gray truncate font-sans">
                    {session.lastMessage}
                  </div>
                </div>

                {/* Action Buttons (Visible on hover) */}
                <div className="absolute right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteSession(session.id);
                    }}
                    className="p-1.5 rounded-md hover:bg-red-500/20 text-neutral-gray hover:text-red-500 transition-all"
                  >
                    <Trash2Icon className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Storage Indicator Area */}
      <div className="p-6 border-t border-white/5 bg-black/20">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[9px] text-neutral-gray font-heading tracking-widest">LOCAL CACHE</span>
          <span className="text-[9px] text-tether-teal font-mono uppercase font-bold tracking-tighter">Optimized</span>
        </div>
        <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
          <div className="h-full w-[15%] bg-tether-teal/40 shadow-glow-sm"></div>
        </div>
      </div>
    </div>
  );
}
