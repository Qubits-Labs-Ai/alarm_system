/**
 * ChatThread - Scrollable message list
 */
import React, { useEffect, useRef } from 'react';
import { MessageRow } from './MessageRow';
import { Message } from './AgentPanel';

interface ChatThreadProps {
  messages: Message[];
  currentMessage: Message | null;
}

export function ChatThread({ messages, currentMessage }: ChatThreadProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, currentMessage]);

  const allMessages = currentMessage ? [...messages, currentMessage] : messages;

  return (
    <div
      ref={scrollRef}
      className="h-full overflow-y-auto px-6 py-4 space-y-6 bg-background"
    >
      {allMessages.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-center">
          <div className="w-16 h-16 mb-4 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-3xl">🤖</span>
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">
            Welcome to PVCI Agent
          </h3>
          <p className="text-sm text-muted-foreground max-w-md">
            I can help you analyze alarm data, identify trends, and answer questions about
            sources, locations, priorities, and more.
          </p>
          <div className="mt-6 space-y-2 text-left text-sm text-muted-foreground max-w-md">
            <p className="font-medium text-foreground">Try asking:</p>
            <ul className="list-disc list-inside space-y-1 pl-2">
              <li>"Show me the top 10 sources by alarm count"</li>
              <li>"Analyze alarm behavior for high priority alarms"</li>
              <li>"What are the most active locations?"</li>
              <li>"List alarms with chattering behavior"</li>
            </ul>
          </div>
        </div>
      ) : (
        allMessages.map((message) => (
          <MessageRow key={message.id} message={message} />
        ))
      )}
    </div>
  );
}
