"use client";

import { useEffect, useRef } from "react";
import { RichMessage } from "./RichMessage";

interface MessageListProps {
  messages: any[];
  isStreaming?: boolean;
}

export function MessageList({ messages = [], isStreaming = false }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
      {messages.map((message, idx) => (
        <RichMessage 
          key={message.id || idx} 
          role={message.role}
          content={message.content}
          parts={message.parts}
          toolInvocations={message.toolInvocations}
          timestamp={message.createdAt}
          isStreaming={isStreaming && idx === messages.length - 1}
        />
      ))}
      <div ref={bottomRef} className="h-4" />
    </div>
  );
}
