/**
 * PVCI Agent Panel - Professional streaming SQL agent
 * Matches the design of the existing PVC-I Agent
 */
import React, { useState, useRef, useEffect } from 'react';
import { X, Sparkles, Copy, ThumbsUp, ThumbsDown, Share2, RotateCcw, MoreHorizontal, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PlaceholdersAndVanishInput } from '@/components/ui/placeholders-and-vanish-input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { streamAgentQuery, generateRequestId, generateSessionId, AgentEvent } from '../../api/agentSSE';
import { cn } from '@/lib/utils';

export interface Message {
  id: string;
  role: 'user' | 'agent';
  content: string;
  reasoning?: string;
  toolCalls?: Array<{ name: string; arguments: string }>;
  toolResults?: string[];
  isStreaming?: boolean;
  pending?: boolean;
}

interface AgentPanelProps {
  onClose: () => void;
}

const WelcomeMessage = `Welcome to PVCI Agent

I can help you analyze alarm data, identify trends, and answer questions about sources, locations, priorities, and more.

Try asking:
- "Show me the top 10 sources by alarm count"
- "Analyze alarm behavior for high priority alarms"
- "What are the most active locations?"
- "List alarms with chattering behavior"`;

export function AgentPanel({ onClose }: AgentPanelProps) {
  const [messages, setMessages] = useState<Message[]>(() => [
    { id: 'm-welcome', role: 'agent', content: WelcomeMessage }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId] = useState(() => generateSessionId());
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [currentAgentMessage, setCurrentAgentMessage] = useState<Message | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (listRef.current) {
      const el = listRef.current.lastElementChild as HTMLElement | null;
      el?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages.length, currentAgentMessage]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', content: text };
    const pendingId = `a-pending-${Date.now()}`;
    const pendingMsg: Message = { id: pendingId, role: 'agent', content: '', pending: true, isStreaming: true, reasoning: '', toolCalls: [], toolResults: [] };
    
    setMessages((m) => [...m, userMsg]);
    setCurrentAgentMessage(pendingMsg);
    setInput('');
    setLoading(true);

    const requestId = generateRequestId();

    try {
      const controller = await streamAgentQuery(
        { query: text, plant: 'PVCI', sessionId, requestId },
        {
          onEvent: (event: AgentEvent) => {
            setCurrentAgentMessage((current) => {
              if (!current) return current;
              const updated = { ...current, pending: false };

              switch (event.type) {
                case 'reasoning':
                  updated.reasoning = (updated.reasoning || '') + (event.content || '');
                  break;
                case 'answer_stream':
                  updated.content += event.content || '';
                  break;
                case 'tool_call':
                  if (event.data) {
                    updated.toolCalls = [...(updated.toolCalls || []), { name: event.data.name, arguments: event.data.arguments }];
                  }
                  break;
                case 'tool_call_update':
                  if (updated.toolCalls && updated.toolCalls.length > 0) {
                    const idx = updated.toolCalls.length - 1;
                    const last = updated.toolCalls[idx];
                    const next = { ...last, arguments: (last.arguments || '') + (event.content || '') };
                    const copy = [...updated.toolCalls];
                    copy[idx] = next;
                    updated.toolCalls = copy;
                  }
                  break;
                case 'tool_result':
                  updated.toolResults = [...(updated.toolResults || []), event.content || ''];
                  break;
                case 'answer_complete':
                  updated.content = event.content || updated.content;
                  updated.isStreaming = false;
                  break;
                case 'complete':
                  updated.isStreaming = false;
                  break;
                case 'error':
                  updated.content = `Error: ${event.message || 'Unknown error'}`;
                  updated.isStreaming = false;
                  break;
              }
              return updated;
            });
          },
          onComplete: () => {
            setLoading(false);
            if (currentAgentMessage) {
              setMessages((m) => [...m, { ...currentAgentMessage, isStreaming: false, pending: false }]);
              setCurrentAgentMessage(null);
            }
          },
          onError: (error) => {
            setLoading(false);
            if (currentAgentMessage) {
              setMessages((m) => [...m, { ...currentAgentMessage, content: `Error: ${error.message}`, isStreaming: false, pending: false }]);
              setCurrentAgentMessage(null);
            }
          },
        }
      );
      setAbortController(controller);
    } catch (err: unknown) {
      setLoading(false);
      const e = err instanceof Error ? err : new Error(String(err));
      if (currentAgentMessage) {
        setMessages((m) => [...m, { ...currentAgentMessage, content: `Error: ${e.message}`, isStreaming: false, pending: false }]);
        setCurrentAgentMessage(null);
      }
    }
  };

  const renderMessage = (m: Message) => {
    const isUser = m.role === 'user';
    return (
      <div key={m.id} className={cn('group flex w-full', isUser ? 'justify-end' : 'justify-start')}>
        <div className={cn('mx-auto max-w-[736px] w-full flex items-start gap-4 px-2', isUser ? 'flex-row-reverse' : 'flex-row')}>
          {/* Avatar */}
          <div className="shrink-0 mt-1">
            {isUser ? (
              <div className="h-8 w-8 rounded-full bg-muted/60" />
            ) : (
              <div className="h-8 w-8 rounded-full bg-primary/10 text-primary grid place-items-center">
                <Sparkles className="h-5 w-5" />
              </div>
            )}
          </div>
          {/* Bubble */}
          <div className={cn(
            'rounded-3xl px-4 py-3 shadow-sm break-words',
            isUser
              ? 'w-fit max-w-[90%] md:max-w-[85%] bg-[#7eb653] dark:bg-[#496930] text-white border-transparent'
              : 'w-full bg-primary/5 text-foreground border-primary/15 border'
          )}>
            {isUser ? (
              <div className="text-white max-w-none whitespace-pre-wrap leading-6">{m.content}</div>
            ) : m.pending ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Generating response…</span>
              </div>
            ) : (
              <>
                {/* Reasoning */}
                {m.reasoning && m.reasoning.trim() && (
                  <div className="mb-3 p-3 rounded-lg bg-muted/30 border border-border">
                    <div className="text-xs font-medium text-muted-foreground mb-1">Reasoning:</div>
                    <div className="text-sm text-foreground whitespace-pre-wrap">{m.reasoning}</div>
                  </div>
                )}
                {/* Tool Calls */}
                {m.toolCalls && m.toolCalls.length > 0 && m.toolCalls.map((tool, idx) => (
                  <div key={idx} className="mb-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
                    <div className="text-xs font-medium text-primary mb-1">🔧 Tool: {tool.name}</div>
                    <div className="text-xs font-mono text-muted-foreground">{tool.arguments.substring(0, 200)}...</div>
                    {m.toolResults && m.toolResults[idx] && (
                      <div className="mt-2 text-xs text-foreground">✓ {m.toolResults[idx]}</div>
                    )}
                  </div>
                ))}
                {/* Answer */}
                <div className="prose prose-sm dark:prose-invert max-w-none leading-6 whitespace-pre-wrap">
                  {m.content}
                  {m.isStreaming && <span className="inline-block w-2 h-4 ml-1 bg-primary animate-pulse" />}
                </div>
              </>
            )}
            {/* Actions */}
            {!isUser && !m.pending && (
              <div className="mt-4 flex items-center gap-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button className="hover:text-foreground" onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(m.content);
                          setCopiedId(m.id);
                          setTimeout(() => setCopiedId(null), 1500);
                        } catch (e) { void e; }
                      }}>
                        <Copy className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>{copiedId === m.id ? 'Copied' : 'Copy'}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <button className="hover:text-foreground"><ThumbsUp className="h-4 w-4" /></button>
                <button className="hover:text-foreground"><ThumbsDown className="h-4 w-4" /></button>
                <button className="hover:text-foreground"><Share2 className="h-4 w-4" /></button>
                <button className="hover:text-foreground"><RotateCcw className="h-4 w-4" /></button>
                <button className="hover:text-foreground"><MoreHorizontal className="h-4 w-4" /></button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const allMessages = currentAgentMessage ? [...messages, currentAgentMessage] : messages;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="relative w-full max-w-5xl h-[90vh] bg-background rounded-lg shadow-2xl flex flex-col border border-border">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/60 bg-background/95 backdrop-blur">
          <div className="flex items-center gap-3">
            <Sparkles className="h-5 w-5 text-primary" />
            <div>
              <h2 className="text-xl font-semibold">PVCI Agent</h2>
              <p className="text-xs text-muted-foreground">Streaming SQL analysis</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setMessages([{ id: 'm-welcome', role: 'agent', content: WelcomeMessage }])}>Clear</Button>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-accent transition-colors" aria-label="Close">
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Chat Body */}
        <div className="flex-1 overflow-y-auto">
          <div ref={listRef} className="space-y-5 sm:space-y-6 py-4">
            {allMessages.map(renderMessage)}
          </div>
        </div>

        {/* Input Area */}
        <div className="border-t border-border p-4 bg-background/95 backdrop-blur">
          <div className="mx-auto max-w-[736px] w-full">
            <PlaceholdersAndVanishInput
              placeholders={[
                "Show me the top 10 sources by alarm count",
                "Analyze alarm behavior for high priority alarms",
                "What are the most active locations?",
                "List alarms with chattering behavior",
                "Find sources with stale alarms",
              ]}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onSubmit={(e) => { e.preventDefault(); send(); }}
              multiline
              minRows={1}
              maxRows={8}
              sendOnEnter
              disabled={loading}
            />
            <div className="text-center text-[11px] text-muted-foreground mt-2">
              {loading
                ? 'Generating response… sending disabled until completion.'
                : `Session: ${sessionId.substring(8, 20)}... | Press Enter to send. Shift+Enter adds a new line.`}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
