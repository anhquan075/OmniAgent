"use client";

import { useEffect, useRef } from "react";
import type { Message } from "@/hooks/use-chat";
import { RichMessage } from "./RichMessage";

interface MessageListProps {
  messages: Message[];
}

export function MessageList({ messages }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
      {messages.map((message) => (
        <RichMessage key={message.id} message={message} />
      ))}
      <div ref={bottomRef} className="h-4" />
    </div>
  );
}
