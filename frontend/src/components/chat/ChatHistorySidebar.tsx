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
    <div className="flex flex-col h-full bg-space-black/50 p-3 sm:p-4">
      <button
        onClick={onNewChat}
        className="flex items-center gap-2 w-full p-2.5 sm:p-3 rounded-xl bg-tether-teal/10 hover:bg-tether-teal/20 border border-tether-teal/20 text-tether-teal transition-all mb-3 sm:mb-4 group min-h-[44px]"
      >
        <MessageSquarePlus className="w-4 h-4 sm:w-5 sm:h-5 group-hover:scale-110 transition-transform flex-shrink-0" />
        <span className="font-heading font-bold text-[10px] sm:text-xs uppercase tracking-wider truncate">New Operation</span>
      </button>

      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1.5 sm:space-y-2">
        {sessions.map((session) => (
          <div
            key={session.id}
            onClick={() => onSelectSession(session.id)}
            className={`
              group flex items-center justify-between p-2.5 sm:p-3 rounded-lg border cursor-pointer transition-all
              ${activeSessionId === session.id
                ? 'bg-white/10 border-tether-teal/50 shadow-glow-sm'
                : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/10'}
            `}
          >
            <div className="flex items-center gap-2 sm:gap-3 overflow-hidden">
              <MessageSquare className={`w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0 ${activeSessionId === session.id ? 'text-tether-teal' : 'text-neutral-gray'}`} />
              <div className="flex flex-col overflow-hidden">
                <span className={`text-[11px] sm:text-xs font-medium truncate ${activeSessionId === session.id ? 'text-white' : 'text-neutral-gray-light'}`}>
                  {session.title || 'Untitled Session'}
                </span>
                <span className="text-[9px] sm:text-[10px] text-neutral-gray truncate">
                  {session.lastMessage || 'No messages'}
                </span>
              </div>
            </div>

            {/* Always visible on mobile (no hover), hidden until hover on sm+ */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDeleteSession(session.id);
              }}
              className="sm:opacity-0 sm:group-hover:opacity-100 p-1.5 rounded-md hover:bg-red-500/20 text-neutral-gray/40 hover:text-red-500 transition-all flex-shrink-0 min-h-[36px] min-w-[36px] flex items-center justify-center sm:min-h-0 sm:min-w-0"
            >
              <Trash2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
