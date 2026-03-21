import React, { useRef } from 'react';
import { RobotEvent } from '../../hooks/useRobotFleetEvents';
import { NETWORK_CONFIGS, NETWORK_MODE } from '../../lib/networkConfig';

interface ActivityFeedProps {
  events: RobotEvent[];
}

const ActivityFeed: React.FC<ActivityFeedProps> = ({ events }) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  const chronologicalEvents = [...events].reverse();
  const networkConfig = NETWORK_CONFIGS[NETWORK_MODE.TESTNET];

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 text-[10px] font-heading uppercase tracking-[0.2em] text-neutral-gray border-b border-white/5 bg-black/40">
        Activity Feed
      </div>
      <div className="flex-1 overflow-y-auto max-h-[300px] sm:max-h-[240px] custom-scrollbar scroll-smooth">
        <div className="p-3 space-y-3">
          {chronologicalEvents.length === 0 ? (
            <div className="text-center text-xs text-neutral-gray py-8 font-mono flex flex-col items-center justify-center h-full">
              Awaiting fleet activity...
            </div>
          ) : (
            chronologicalEvents.map((event, index) => {
              const IconComponent = event.icon;
              const eventData = (event as any).event || event;
              return (
                <div
                  key={`${eventData.robotId}-${eventData.timestamp}-${index}`}
                  className="text-xs flex items-start gap-3 animate-in fade-in slide-in-from-bottom-1 duration-300 border-b border-white/5 pb-2 last:border-0"
                >
                  <span className="text-neutral-gray whitespace-nowrap font-mono text-[10px] mt-0.5 opacity-70">
                    [{new Date(eventData.timestamp).toLocaleTimeString([], { hour12: false })}]
                  </span>
                  <span className="leading-relaxed flex flex-wrap items-center gap-x-1.5">
                    {IconComponent && <IconComponent className="w-3.5 h-3.5 text-tether-teal inline-block" />}
                    <span className="font-medium text-tether-teal">Robot {eventData.robotId}</span>
                    <span className="font-bold text-neon-green">{eventData.earnings} USDT</span>
                    <span className="text-neutral-gray">from</span>
                    <span className="text-white/90">{eventData.taskName}</span>
                    {eventData.txHash && (
                      <a 
                        href={`${networkConfig.blockExplorer}/tx/${eventData.txHash}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] text-tether-teal/60 hover:text-tether-teal hover:bg-tether-teal/10 rounded transition-colors ml-1"
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
