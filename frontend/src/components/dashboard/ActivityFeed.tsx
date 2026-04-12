import React, { useRef } from 'react';
import { RobotEvent } from '../../hooks/useRobotFleetEvents';
import { NETWORK_CONFIGS, NETWORK_MODE } from '../../lib/networkConfig';
import { ExternalLink } from 'lucide-react';

interface ActivityFeedProps {
  events: RobotEvent[];
}

const ActivityFeed: React.FC<ActivityFeedProps> = ({ events }) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  const chronologicalEvents = [...events].reverse();
  const networkConfig = NETWORK_CONFIGS[NETWORK_MODE.TESTNET];

  return (
    <div className="flex flex-col h-full">
      <div className="px-2.5 sm:px-3 md:px-4 py-2 sm:py-2.5 md:py-3 flex items-center gap-2 text-[9px] sm:text-[10px] font-heading uppercase tracking-wider text-neutral-gray border-b border-white/5 glass">
        <span className="w-1.5 h-1.5 rounded-full bg-tether-teal animate-pulse flex-shrink-0" />
        Activity Feed
      </div>

      <div className="flex-1 overflow-y-auto max-h-[240px] sm:max-h-[200px] md:max-h-[240px] custom-scrollbar scroll-smooth">
        <div className="p-2 sm:p-2.5 space-y-1 sm:space-y-1.5">
          {chronologicalEvents.length === 0 ? (
            <div className="text-center text-[10px] sm:text-xs font-heading tracking-wider text-neutral-gray py-8 flex flex-col items-center justify-center">
              Awaiting fleet activity...
            </div>
          ) : (
            chronologicalEvents.map((event, index) => {
              const IconComponent = event.icon;
              const eventData = (event as any).event || event;
              const earnings = parseFloat(eventData.earnings || '0');
              const earningsColor = earnings > 0.01
                ? 'text-neon-green'
                : earnings > 0
                  ? 'text-tether-teal'
                  : 'text-neutral-gray';

              return (
                <div
                  key={`${eventData.robotId}-${eventData.timestamp}-${index}`}
                  className="flex items-start gap-2 sm:gap-2.5 px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors animate-in fade-in slide-in-from-bottom-1 duration-300 group"
                >
                  {/* Left accent */}
                  <div className={`w-0.5 self-stretch rounded-full flex-shrink-0 mt-0.5 ${earningsColor === 'text-neon-green' ? 'bg-neon-green/40' : 'bg-tether-teal/30'}`} />

                  {/* Timestamp — hidden on xs, visible sm+ */}
                  <span className="hidden sm:block text-[8px] sm:text-[9px] font-heading text-neutral-gray/50 tracking-wider whitespace-nowrap mt-0.5 w-16 flex-shrink-0">
                    {new Date(eventData.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 leading-relaxed">
                      {IconComponent && <IconComponent className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-tether-teal/70 flex-shrink-0" />}
                      <span className="font-semibold text-white/70 text-[9px] sm:text-[10px] font-heading tracking-wider">R-{eventData.robotId}</span>
                      <span className={`font-semibold text-[9px] sm:text-[10px] md:text-[11px] font-heading ${earningsColor}`}>+{eventData.earnings} USDT</span>
                      <span className="text-neutral-gray/50 text-[9px] sm:text-[10px] hidden xs:inline">·</span>
                      <span className="text-white/60 text-[9px] sm:text-[10px] font-heading tracking-wider truncate hidden xs:inline">{eventData.taskName}</span>
                      {/* time shown inline on mobile */}
                      <span className="sm:hidden text-[8px] font-heading text-neutral-gray/40 tracking-wider ml-auto">
                        {new Date(eventData.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>

                  {/* Tx link */}
                  {eventData.txHash && (
                    <a
                      href={`${networkConfig.blockExplorer}/tx/${eventData.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-tether-teal/10"
                      title="View transaction"
                    >
                      <ExternalLink className="w-3 h-3 text-tether-teal/60 flex-shrink-0" />
                    </a>
                  )}
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
