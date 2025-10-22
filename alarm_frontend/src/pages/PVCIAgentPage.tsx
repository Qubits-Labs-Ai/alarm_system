/**
 * PVCI Agent Page - Streaming SQL analysis agent
 * Full-page experience matching the existing Agent design
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageShell } from "@/components/dashboard/PageShell";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Sparkles, ArrowLeft, Copy, ThumbsUp, ThumbsDown, Share2, RotateCcw, MoreHorizontal, Loader2 } from "lucide-react";
import { PlaceholdersAndVanishInput } from "@/components/ui/placeholders-and-vanish-input";
import { streamAgentQuery, generateRequestId, generateSessionId, AgentEvent } from "@/api/agentSSE";
import { cn } from "@/lib/utils";

type Message = {
  id: string;
  role: 'user' | 'agent';
  content: string;
  reasoning?: string;
  toolCalls?: Array<{ name: string; arguments: string }>;
  toolResults?: string[];
  pending?: boolean;
  isStreaming?: boolean;
};

const WelcomeMarkdown = `Welcome to PVCI Agent

I can help you analyze alarm data, identify trends, and answer questions about sources, locations, priorities, and more.

**Try asking:**

- "Show me the top 10 sources by alarm count"
- "Analyze alarm behavior for high priority alarms"
- "What are the most active locations?"
- "List alarms with chattering behavior"`;

const PVCIAgentPage = () => {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>(() => [
    { id: "m-welcome", role: "agent", content: WelcomeMarkdown },
  ]);
  const [input, setInput] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sessionId] = useState(() => generateSessionId());
  // Track the active request's controller and message id to update messages in-place
  const activeControllerRef = useRef<AbortController | null>(null);
  const [activeAnswerId, setActiveAnswerId] = useState<string | null>(null);

  // auto-scroll to bottom
  useEffect(() => {
    const el = listRef.current?.lastElementChild as HTMLElement | null;
    el?.scrollIntoView({ behavior: "smooth", block: "end" });
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    });
  }, [messages.length]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = { id: `u-${Date.now()}`, role: "user", content: text };
    const answerId = `a-${Date.now()}`;
    const answerMsg: Message = { id: answerId, role: "agent", content: "", pending: true, isStreaming: true, reasoning: "", toolCalls: [], toolResults: [] };

    setMessages((m) => [...m, userMsg, answerMsg]);
    setInput("");
    setLoading(true);
    setActiveAnswerId(answerId);

    const requestId = generateRequestId();

    try {
      const controller = await streamAgentQuery(
        { query: text, plant: "PVCI", sessionId, requestId },
        {
          onEvent: (event: AgentEvent) => {
            // Update the active answer message in-place
            setMessages((prev) => prev.map((m) => {
              if (m.id !== answerId) return m;
              const updated: Message = { ...m, pending: false };
              switch (event.type) {
                case "reasoning":
                  updated.reasoning = (updated.reasoning || "") + (event.content || "");
                  return updated;
                case "answer_stream":
                  updated.content = (updated.content || "") + (event.content || "");
                  return updated;
                case "tool_call":
                  if (event.data) {
                    updated.toolCalls = [ ...(updated.toolCalls || []), { name: event.data.name, arguments: event.data.arguments } ];
                  }
                  return updated;
                case "tool_call_update":
                  if (updated.toolCalls && updated.toolCalls.length > 0) {
                    const idx = updated.toolCalls.length - 1;
                    const last = updated.toolCalls[idx];
                    const next = { ...last, arguments: (last.arguments || "") + (event.content || "") };
                    const copy = [...updated.toolCalls];
                    copy[idx] = next;
                    updated.toolCalls = copy;
                  }
                  return updated;
                case "tool_result":
                  updated.toolResults = [ ...(updated.toolResults || []), event.content || "" ];
                  return updated;
                case "answer_complete":
                  updated.content = event.content || updated.content;
                  updated.isStreaming = false;
                  return updated;
                case "complete":
                  updated.isStreaming = false;
                  return updated;
                case "error":
                  updated.content = `Error: ${event.message || "Unknown error"}`;
                  updated.isStreaming = false;
                  return updated;
                default:
                  return updated;
              }
            }));
          },
          onComplete: () => {
            setLoading(false);
            setActiveAnswerId(null);
          },
          onError: (error) => {
            setLoading(false);
            setMessages((m) => m.map((mm) => mm.id === answerId ? { ...mm, content: `Error: ${error.message}`, isStreaming: false, pending: false } : mm));
            setActiveAnswerId(null);
          },
        }
      );
      activeControllerRef.current = controller;
    } catch (error: any) {
      setLoading(false);
      setMessages((m) => m.map((mm) => mm.id === answerId ? { ...mm, content: `Error: ${error.message}`, isStreaming: false, pending: false } : mm));
      setActiveAnswerId(null);
    }
  };

  const renderMessage = (m: Message) => {
    const isUser = m.role === "user";
    return (
      <div key={m.id} className={`group flex w-full ${isUser ? "justify-end" : "justify-start"}`}>
        <div
          className={`mx-auto max-w-[736px] w-full flex ${isUser ? "flex-row-reverse" : "flex-row"} items-start gap-4 px-2 sm:px-0`}
        >
          {/* Avatar */}
          <div className={`shrink-0 mt-1 ${isUser ? "ml-1" : "mr-1"}`}>
            {isUser ? (
              <div className="h-8 w-8 rounded-full bg-muted/60" />
            ) : (
              <div className="h-8 w-8 rounded-full bg-primary/10 text-primary grid place-items-center">
                <Sparkles className="h-5 w-5" />
              </div>
            )}
          </div>
          {/* Bubble */}
          <div
            className={cn(
              "rounded-3xl px-4 py-3 shadow-sm break-words",
              isUser
                ? "w-fit max-w-[90%] md:max-w-[85%] ml-6 sm:ml-10 bg-[#7eb653] dark:bg-[#496930] text-white border-transparent"
                : "w-full bg-primary/5 text-foreground border-primary/15 border"
            )}
          >
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
                    <div className="text-xs font-medium text-muted-foreground mb-1">💭 Reasoning:</div>
                    <div className="text-sm text-foreground whitespace-pre-wrap">{m.reasoning}</div>
                  </div>
                )}
                {/* Tool Calls */}
                {m.toolCalls &&
                  m.toolCalls.length > 0 &&
                  m.toolCalls.map((tool, idx) => (
                    <div key={idx} className="mb-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
                      <div className="text-xs font-medium text-primary mb-1">🔧 Tool: {tool.name}</div>
                      <div className="text-xs font-mono text-muted-foreground overflow-x-auto">
                        {tool.arguments.substring(0, 300)}...
                      </div>
                      {m.toolResults && m.toolResults[idx] && (
                        <div className="mt-2 text-xs text-foreground">✓ {m.toolResults[idx].substring(0, 200)}...</div>
                      )}
                    </div>
                  ))}
                {/* Answer */}
                <div className="prose prose-sm dark:prose-invert max-w-none leading-6 prose-p:my-2 prose-ul:my-1 prose-li:my-0.5 whitespace-pre-wrap">
                  {m.content}
                  {m.isStreaming && <span className="inline-block w-2 h-4 ml-1 bg-primary animate-pulse" />}
                </div>
              </>
            )}
            {!isUser && !m.pending && (
              <div className="mt-4 flex items-center gap-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        className="hover:text-foreground"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(m.content);
                            setCopiedId(m.id);
                            window.setTimeout(() => setCopiedId(null), 1500);
                          } catch {}
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>{copiedId === m.id ? "Copied" : "Copy"}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <button className="hover:text-foreground">
                  <ThumbsUp className="h-4 w-4" />
                </button>
                <button className="hover:text-foreground">
                  <ThumbsDown className="h-4 w-4" />
                </button>
                <button className="hover:text-foreground">
                  <Share2 className="h-4 w-4" />
                </button>
                <button className="hover:text-foreground">
                  <RotateCcw className="h-4 w-4" />
                </button>
                <button className="hover:text-foreground">
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const allMessages = messages;

  return (
    <PageShell>
      <div className="flex flex-col gap-3">
        {/* Header (sticky below global navbar) */}
        <div className="flex items-center justify-between sticky z-40 bg-background backdrop-blur supports-[backdrop-filter]:backdrop-blur py-2 border-b border-border/60">
          <div className="flex items-center gap-3 ">
            <Sparkles className="h-5 w-5 text-primary" />
            <div>
              <h2 className="text-xl font-semibold">PVCI Agent</h2>
              <p className="text-xs text-muted-foreground">Streaming SQL analysis</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMessages([{ id: "m-welcome", role: "agent", content: WelcomeMarkdown }])}
            >
              Clear
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Dashboard
            </Button>
          </div>
        </div>
        {/* Chat body ensures composer sits at bottom on short pages */}
        <div className="flex flex-col min-h-[calc(100vh-220px)]">
          {/* Messages (page scroll) */}
          <div ref={listRef} className="flex-1 space-y-5 sm:space-y-6 py-4">
            {allMessages.map(renderMessage)}
          </div>

          {/* Composer pinned to bottom of viewport */}
          <div className="sticky bottom-0 border-t border-border p-4 bg-background backdrop-blur supports-[backdrop-filter]:backdrop-blur pb-[env(safe-area-inset-bottom)]">
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
                onSubmit={(e) => {
                  e.preventDefault();
                  send();
                }}
                multiline
                minRows={1}
                maxRows={8}
                sendOnEnter
                disabled={loading}
              />
              <div className="text-center text-[11px] text-muted-foreground mt-2">
                {loading
                  ? "Generating response… sending disabled until completion."
                  : `Session: ${sessionId.substring(8, 20)}... | Press Enter to send. Shift+Enter adds a new line. PVCI Agent can make mistakes—verify important information.`}
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
};

export default PVCIAgentPage;
