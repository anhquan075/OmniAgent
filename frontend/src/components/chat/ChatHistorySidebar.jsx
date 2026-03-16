import React from 'react';
import { MessageSquarePlus, Trash2, MessageSquare } from 'lucide-react';

export function ChatHistorySidebar({ 
  sessions = [], 
  activeSessionId, 
  onSelectSession, 
  onNewChat, 
  onDeleteSession 
}) {
  return (
    <div className="flex flex-col h-full bg-space-black/50 p-4">
      <button
        onClick={onNewChat}
        className="flex items-center gap-2 w-full p-3 rounded-xl bg-tether-teal/10 hover:bg-tether-teal/20 border border-tether-teal/20 text-tether-teal transition-all mb-4 group"
      >
        <MessageSquarePlus className="w-5 h-5 group-hover:scale-110 transition-transform" />
        <span className="font-heading font-bold text-xs uppercase tracking-wider">New Operation</span>
      </button>

      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2">
        {sessions.map((session) => (
          <div
            key={session.id}
            onClick={() => onSelectSession(session.id)}
            className={`
              group flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all
              ${activeSessionId === session.id 
                ? 'bg-white/10 border-tether-teal/50 shadow-glow-sm' 
                : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/10'}
            `}
          >
            <div className="flex items-center gap-3 overflow-hidden">
              <MessageSquare className={`w-4 h-4 flex-shrink-0 ${activeSessionId === session.id ? 'text-tether-teal' : 'text-neutral-gray'}`} />
              <div className="flex flex-col overflow-hidden">
                <span className={`text-xs font-medium truncate ${activeSessionId === session.id ? 'text-white' : 'text-neutral-gray-light'}`}>
                  {session.title || 'Untitled Session'}
                </span>
                <span className="text-[10px] text-neutral-gray truncate">
                  {session.lastMessage || 'No messages'}
                </span>
              </div>
            </div>
            
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDeleteSession(session.id);
              }}
              className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md hover:bg-red-500/20 text-neutral-gray hover:text-red-500 transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
