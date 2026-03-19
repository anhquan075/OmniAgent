import React, { useRef } from 'react';
import { RobotEvent } from '../../hooks/useRobotFleetEvents';

interface ActivityFeedProps {
  events: RobotEvent[];
}

const ActivityFeed: React.FC<ActivityFeedProps> = ({ events }) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  const chronologicalEvents = [...events].reverse();

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 text-[9px] font-heading uppercase tracking-[0.2em] text-neutral-gray border-b border-white/5 bg-black/40">
        Activity Feed
      </div>
      <div className="flex-1 overflow-y-auto max-h-[200px] custom-scrollbar scroll-smooth">
        <div className="p-3 space-y-2">
          {chronologicalEvents.length === 0 ? (
            <div className="text-center text-[10px] text-neutral-gray py-6 font-mono flex flex-col items-center justify-center h-full">
              Awaiting fleet activity...
            </div>
          ) : (
            chronologicalEvents.map((event, index) => {
              const IconComponent = event.icon;
              const eventData = (event as any).event || event;
              return (
                <div
                  key={`${eventData.robotId}-${eventData.timestamp}-${index}`}
                  className="text-[10px] flex items-start gap-2 animate-in fade-in slide-in-from-bottom-1 duration-300"
                >
                  <span className="text-neutral-gray whitespace-nowrap font-mono text-[9px] mt-px">
                    [{new Date(eventData.timestamp).toLocaleTimeString([], { hour12: false })}]
                  </span>
                  <span className="leading-relaxed flex flex-wrap items-center gap-x-1">
                    {IconComponent && <IconComponent className="w-3 h-3 text-tether-teal inline-block" />}
                    <span className="font-medium text-tether-teal">Robot {eventData.robotId}</span>
                    <span className="text-neutral-gray">earned</span>
                    <span className="font-bold text-neon-green">{eventData.earnings} BNB</span>
                    <span className="text-neutral-gray">from</span>
                    <span className="text-white/80">{eventData.taskName}</span>
                    {eventData.txHash && (
                      <a 
                        href={`https://testnet.bscscan.com/tx/${eventData.txHash}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-tether-teal/60 hover:text-tether-teal underline decoration-dotted underline-offset-2 ml-1 transition-colors"
                      >
                        [tx]
                      </a>
                    )}
                  </span>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
};

export default ActivityFeed;
