/**
 * MessageRow - Individual message display with reasoning, tools, and streaming
 */
import React, { useState } from 'react';
import { User, Bot, ChevronDown, ChevronRight, Wrench, CheckCircle } from 'lucide-react';
import { Message } from './AgentPanel';

interface MessageRowProps {
  message: Message;
}

export function MessageRow({ message }: MessageRowProps) {
  const [showReasoning, setShowReasoning] = useState(false);
  const [showToolDetails, setShowToolDetails] = useState<number | null>(null);

  const isUser = message.role === 'user';

  return (
    <div className={`flex gap-4 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {/* Avatar */}
      {!isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
          <Bot className="w-5 h-5 text-primary" />
        </div>
      )}

      {/* Message Content */}
      <div className={`max-w-[75%] ${isUser ? 'order-first' : ''}`}>
        {/* User Message */}
        {isUser ? (
          <div className="bg-primary text-primary-foreground px-4 py-3 rounded-lg shadow-sm">
            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
          </div>
        ) : (
          /* Agent Message */
          <div className="space-y-3">
            {/* Reasoning Panel (Collapsible) */}
            {message.reasoning && message.reasoning.trim() && (
              <div className="border border-border rounded-lg overflow-hidden bg-card">
                <button
                  onClick={() => setShowReasoning(!showReasoning)}
                  className="w-full px-4 py-2 flex items-center justify-between bg-muted/50 hover:bg-muted transition-colors text-sm font-medium text-foreground"
                >
                  <span className="flex items-center gap-2">
                    {showReasoning ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                    Reasoning
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {message.reasoning.length} chars
                  </span>
                </button>
                {showReasoning && (
                  <div className="px-4 py-3 text-sm text-muted-foreground whitespace-pre-wrap bg-background">
                    {message.reasoning}
                  </div>
                )}
              </div>
            )}

            {/* Tool Calls */}
            {message.toolCalls && message.toolCalls.length > 0 && (
              <div className="space-y-2">
                {message.toolCalls.map((tool, idx) => (
                  <div key={idx} className="border border-border rounded-lg overflow-hidden bg-card">
                    <div className="px-4 py-2 bg-muted/50 flex items-center gap-2 text-sm">
                      <Wrench className="w-4 h-4 text-primary" />
                      <span className="font-medium text-foreground">Tool: {tool.name}</span>
                      <button
                        onClick={() => setShowToolDetails(showToolDetails === idx ? null : idx)}
                        className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showToolDetails === idx ? 'Hide' : 'View'} Details
                      </button>
                    </div>
                    {showToolDetails === idx && (
                      <div className="px-4 py-3 text-xs font-mono text-muted-foreground bg-background overflow-x-auto">
                        {tool.arguments}
                      </div>
                    )}
                    {message.toolResults && message.toolResults[idx] && (
                      <div className="px-4 py-3 border-t border-border bg-background">
                        <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
                          <CheckCircle className="w-3 h-3 text-success" />
                          <span>Result Preview (first 500 chars)</span>
                        </div>
                        <pre className="text-xs font-mono text-foreground whitespace-pre-wrap overflow-x-auto">
                          {message.toolResults[idx]}
                        </pre>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Answer Content */}
            {message.content && (
              <div className="bg-card border border-border px-4 py-3 rounded-lg shadow-sm">
                <p className="text-sm text-foreground whitespace-pre-wrap">
                  {message.content}
                  {message.isStreaming && (
                    <span className="inline-block w-2 h-4 ml-1 bg-primary animate-pulse" />
                  )}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Timestamp */}
        <div className={`mt-1 text-xs text-muted-foreground ${isUser ? 'text-right' : 'text-left'}`}>
          {message.timestamp.toLocaleTimeString()}
        </div>
      </div>

      {/* User Avatar */}
      {isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center">
          <User className="w-5 h-5 text-muted-foreground" />
        </div>
      )}
    </div>
  );
}
