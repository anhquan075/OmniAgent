import React, { useEffect, useRef } from 'react';
import { RobotEvent } from '../../hooks/useRobotFleetEvents';

interface ActivityFeedProps {
  events: RobotEvent[];
}

const ActivityFeed: React.FC<ActivityFeedProps> = ({ events }) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  const chronologicalEvents = [...events].reverse();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 text-[9px] font-heading uppercase tracking-[0.2em] text-neutral-gray border-b border-white/5 bg-black/40">
        Activity Feed
      </div>
      <div className="flex-1 overflow-y-auto h-[200px] custom-scrollbar scroll-smooth">
        <div className="p-3 space-y-2 min-h-full">
          {chronologicalEvents.length === 0 ? (
            <div className="text-center text-[10px] text-neutral-gray py-6 font-mono flex flex-col items-center justify-center h-full">
              Awaiting fleet activity...
            </div>
          ) : (
            chronologicalEvents.map((event, index) => {
              const IconComponent = event.icon;
              return (
                <div
                  key={`${event.robotId}-${index}`}
                  className="text-[10px] flex items-start gap-2 animate-in fade-in slide-in-from-bottom-1 duration-300"
                >
                  <span className="text-neutral-gray whitespace-nowrap font-mono text-[9px] mt-px">
                    [{new Date(event.timestamp).toLocaleTimeString([], { hour12: false })}]
                  </span>
                  <span className="leading-relaxed flex flex-wrap items-center gap-x-1">
                    {IconComponent && <IconComponent className="w-3 h-3 text-tether-teal inline-block" />}
                    <span className="font-medium text-tether-teal">Robot {event.robotId}</span>
                    <span className="text-neutral-gray">earned</span>
                    <span className="font-bold text-neon-green">{event.earnings} ETH</span>
                    <span className="text-neutral-gray">from</span>
                    <span className="text-white/80">{event.taskName}</span>
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
