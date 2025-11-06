/**
 * PVCI Agent Page - Streaming SQL analysis agent
 * Full-page experience matching the existing Agent design
 */
import { useEffect, useRef, useState, Children, isValidElement, useCallback, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { PageShell } from "@/components/dashboard/PageShell";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Sparkles, ArrowLeft, Copy, ThumbsUp, ThumbsDown, Loader2, ChevronDown } from "lucide-react";
import { PlaceholdersAndVanishInput } from "@/components/ui/placeholders-and-vanish-input";
import { streamAgentQuery, generateRequestId, generateSessionId, AgentEvent, ChartDataPayload } from "@/api/agentSSE";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "@/components/ui/use-toast";
import { AgentInlineChart } from "@/components/agent/AgentInlineChart";

type ReasoningPhase = {
  label: string;  // "Planning", "Iteration 1 Analysis", "Final Review"
  content: string;
  timestamp: number;
};

type Message = {
  id: string;
  role: 'user' | 'agent';
  content: string;
  reasoningPhases?: ReasoningPhase[];  // Multiple reasoning blocks
  toolCalls?: Array<{ name: string; arguments: string }>;
  toolResults?: string[];
  charts?: ChartDataPayload[];  // Inline charts
  pending?: boolean;
  isStreaming?: boolean;
  // Track state for intelligent phase labeling
  _toolCallCount?: number;  // How many tools have been called
  _lastReasoningPhase?: string;  // Last phase label to avoid duplicates
  // Track which section should be open (format: 'reasoning-0', 'tool-0', 'chart-0', etc)
  _openSection?: string;
  // Internal: signature map for chart de-duplication (signature → index)
  _chartSigMap?: Record<string, number>;
  feedback?: "like" | "dislike";
};

// Remove any inline tool-call markup the model might echo into the answer text
function sanitizeAnswerChunk(raw: string | undefined): string {
  if (!raw) return "";
  let s = raw;
  // Strip XML-like tool call blocks
  s = s.replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, "");
  s = s.replace(/<arg_key>[\s\S]*?<\/arg_key>/gi, "");
  s = s.replace(/<arg_value>[\s\S]*?<\/arg_value>/gi, "");
  // Optional: strip fenced blocks labeled tool or arguments
  s = s.replace(/```\s*(tool|arguments|argument|tool_call)[\s\S]*?```/gi, "");
  return s;
}

// Limit how many charts we show per answer to keep UX focused
const MAX_CHARTS_PER_ANSWER = 3;

// Build a stable signature for a chart to de-duplicate across iterations
function chartSignature(chart: ChartDataPayload): string {
  try {
    const { type, config, data } = chart;
    // Normalize data lightly: round numeric values and only include first 50 rows for signature
    const norm = (val: any) => {
      if (typeof val === 'number' && isFinite(val)) return Math.round(val * 1000) / 1000;
      return val;
    };
    const dataSample = (Array.isArray(data) ? data.slice(0, 50) : []).map((row) => {
      const out: Record<string, any> = {};
      Object.keys(row || {}).forEach((k) => { out[k] = norm((row as any)[k]); });
      return out;
    });
    const key = {
      t: type,
      // Title and axis keys typically define the intent; include layout too
      c: {
        title: config?.title,
        xKey: (config as any)?.xKey,
        yKeys: (config as any)?.yKeys,
        nameKey: (config as any)?.nameKey,
        valueKey: (config as any)?.valueKey,
        layout: (config as any)?.layout,
      },
      n: dataSample,
      len: Array.isArray(data) ? data.length : 0,
    };
    return JSON.stringify(key);
  } catch {
    return `${chart.type}:${chart?.config?.title || ''}`;
  }
}

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
  const abortedRef = useRef(false);

  // auto-scroll to bottom
  useEffect(() => {
    const el = listRef.current?.lastElementChild as HTMLElement | null;
    el?.scrollIntoView({ behavior: "smooth", block: "end" });
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    });
  }, [messages.length]);

  const stopStreaming = useCallback(() => {
    if (!activeControllerRef.current || !activeAnswerId) return;
    try {
      abortedRef.current = true;
      activeControllerRef.current.abort();
    } catch (e) {
      // noop
    }
    setLoading(false);
    setMessages((m) => m.map((mm) => mm.id === activeAnswerId ? { ...mm, isStreaming: false, pending: false } : mm));
    setActiveAnswerId(null);
    toast({ description: "Stopped generating." });
  }, [activeAnswerId]);

  useEffect(() => {
    if (!loading) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        stopStreaming();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [loading, stopStreaming]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = { id: `u-${Date.now()}`, role: "user", content: text };
    const answerId = `a-${Date.now()}`;
    const answerMsg: Message = { 
      id: answerId, 
      role: "agent", 
      content: "", 
      pending: true, 
      isStreaming: true, 
      reasoningPhases: [], 
      toolCalls: [], 
      toolResults: [],
      charts: [],
      _toolCallCount: 0,
      _lastReasoningPhase: "",
      _openSection: undefined
    };

    setMessages((m) => [...m, userMsg, answerMsg]);
    setInput("");
    setLoading(true);
    setActiveAnswerId(answerId);
    abortedRef.current = false;

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
                case "reasoning": {
                  // Determine phase label based on tool call count
                  const toolCount = updated._toolCallCount || 0;
                  let phaseLabel = "Planning";
                  if (toolCount === 0) {
                    phaseLabel = "Planning";
                  } else if (toolCount === 1) {
                    phaseLabel = "Iteration 1 - Analysis";
                  } else if (toolCount === 2) {
                    phaseLabel = "Iteration 2 - Analysis";
                  } else if (toolCount >= 3) {
                    phaseLabel = `Iteration ${toolCount} - Analysis`;
                  }
                  
                  // Check if we should create a new phase or append to existing
                  const phases = updated.reasoningPhases || [];
                  const lastPhase = phases[phases.length - 1];
                  
                  if (!lastPhase || lastPhase.label !== phaseLabel) {
                    // New phase - create new reasoning block
                    updated.reasoningPhases = [
                      ...phases,
                      {
                        label: phaseLabel,
                        content: event.content || "",
                        timestamp: Date.now()
                      }
                    ];
                    // Auto-open this new reasoning phase unless a chart is currently open
                    if (!(updated._openSection && updated._openSection.startsWith("chart-"))) {
                      updated._openSection = `reasoning-${phases.length}`;
                    }
                  } else {
                    // Same phase - append to existing
                    const updatedPhases = [...phases];
                    updatedPhases[updatedPhases.length - 1] = {
                      ...lastPhase,
                      content: lastPhase.content + (event.content || "")
                    };
                    updated.reasoningPhases = updatedPhases;
                  }
                  updated._lastReasoningPhase = phaseLabel;
                  return updated;
                }
                case "answer_stream":
                  updated.content = (updated.content || "") + sanitizeAnswerChunk(event.content);
                  return updated;
                case "tool_call": {
                  if (event.data) {
                    const data = event.data as { name?: string; arguments?: string };
                    const newToolIndex = (updated.toolCalls || []).length;
                    updated.toolCalls = [
                      ...(updated.toolCalls || []),
                      { name: data?.name || "", arguments: data?.arguments || "" }
                    ];
                    // Increment tool count for reasoning phase tracking
                    updated._toolCallCount = (updated._toolCallCount || 0) + 1;
                    // Auto-open this new tool call unless a chart is currently open
                    if (!(updated._openSection && updated._openSection.startsWith("chart-"))) {
                      updated._openSection = `tool-${newToolIndex}`;
                    }
                  }
                  return updated;
                }
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
                case "chart_data": {
                  const chartPayload = event.data as ChartDataPayload;
                  const sig = chartSignature(chartPayload);
                  const sigMap = { ...(updated._chartSigMap || {}) } as Record<string, number>;
                  const nextCharts = [...(updated.charts || [])];

                  if (sig in sigMap) {
                    // Replace existing chart with refined latest one
                    const idx = sigMap[sig]!;
                    nextCharts[idx] = chartPayload;
                    updated.charts = nextCharts;
                    updated._chartSigMap = sigMap;
                    updated._openSection = `chart-${idx}`;
                  } else {
                    if (nextCharts.length < MAX_CHARTS_PER_ANSWER) {
                      sigMap[sig] = nextCharts.length;
                      nextCharts.push(chartPayload);
                      updated.charts = nextCharts;
                      updated._chartSigMap = sigMap;
                      // Auto-open the new chart section
                      const chartIndex = nextCharts.length - 1;
                      updated._openSection = `chart-${chartIndex}`;
                    } else {
                      // When at cap, prefer replacing the last chart to reflect latest refinement
                      const replaceIdx = nextCharts.length - 1;
                      // Remove old mapping for the chart being replaced
                      const oldSig = Object.keys(sigMap).find((k) => sigMap[k] === replaceIdx);
                      if (oldSig) delete sigMap[oldSig];
                      nextCharts[replaceIdx] = chartPayload;
                      sigMap[sig] = replaceIdx;
                      updated.charts = nextCharts;
                      updated._chartSigMap = sigMap;
                      updated._openSection = `chart-${replaceIdx}`;
                    }
                  }
                  // Nudge Recharts to recalc dimensions after the chart mounts in a collapsible
                  // Delay slightly so DOM has applied layout
                  try {
                    window.setTimeout(() => window.dispatchEvent(new Event("resize")), 80);
                  } catch { /* noop */ }
                  return updated;
                }
                case "answer_complete":
                  updated.content = sanitizeAnswerChunk(event.content) || updated.content;
                  updated.isStreaming = false;
                  // After final content arrives, nudge Recharts in case layout changed
                  try {
                    window.setTimeout(() => window.dispatchEvent(new Event("resize")), 80);
                  } catch { /* noop */ }
                  return updated;
                case "complete":
                  updated.isStreaming = false;
                  // Finalize with a resize to ensure any open chart renders
                  try {
                    window.setTimeout(() => window.dispatchEvent(new Event("resize")), 80);
                  } catch { /* noop */ }
                  return updated;
                case "error": {
                  // Show detailed error message with debug info if available
                  const errorMsg = event.message || "Unknown error";
                  const eventData = event as unknown as Record<string, unknown>;
                  const debugInfo = eventData.debug as string | undefined;
                  const errorType = eventData.error_type as string | undefined;
                  
                  let fullError = `**Error**: ${errorMsg}`;
                  if (errorType) {
                    fullError += `\n\n**Type**: ${errorType}`;
                  }
                  if (debugInfo && debugInfo !== errorMsg) {
                    fullError += `\n\n**Details**: ${debugInfo}`;
                  }
                  
                  updated.content = fullError;
                  updated.isStreaming = false;
                  return updated;
                }
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
            if (abortedRef.current) {
              // Treat as user-cancelled: do not overwrite content with error
              setMessages((m) => m.map((mm) => mm.id === answerId ? { ...mm, isStreaming: false, pending: false } : mm));
            } else {
              setMessages((m) => m.map((mm) => mm.id === answerId ? { ...mm, content: `Error: ${error.message}`, isStreaming: false, pending: false } : mm));
            }
            setActiveAnswerId(null);
          },
        }
      );
      activeControllerRef.current = controller;
    } catch (error: unknown) {
      setLoading(false);
      const message = error instanceof Error ? error.message : String(error);
      setMessages((m) => m.map((mm) => mm.id === answerId ? { ...mm, content: `Error: ${message}`, isStreaming: false, pending: false } : mm));
      setActiveAnswerId(null);
    }
  };

  const [manualOverrides, setManualOverrides] = useState<Record<string, boolean>>({});

  const renderMessage = (m: Message) => {
    const isUser = m.role === "user";
    
    const isOpen = (sectionId: string) => {
      if (manualOverrides[`${m.id}-${sectionId}`] !== undefined) {
        return manualOverrides[`${m.id}-${sectionId}`];
      }
      return m._openSection === sectionId;
    };
    
    const toggleSection = (sectionId: string, currentState: boolean) => {
      setManualOverrides(prev => ({
        ...prev,
        [`${m.id}-${sectionId}`]: !currentState
      }));
      // When opening a chart section, trigger a window resize to force Recharts to recompute dimensions
      // Recharts' ResponsiveContainer measures width at mount; inside a collapsing container it may read 0.
      if (sectionId.startsWith("chart-") && !currentState) {
        window.setTimeout(() => {
          try { window.dispatchEvent(new Event("resize")); } catch { /* noop */ }
        }, 60);
      }
    };
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
              "break-words",
              isUser
                ? "rounded-3xl px-4 py-3 shadow-sm w-fit max-w-[90%] md:max-w-[85%] ml-6 sm:ml-10 bg-card/85 backdrop-blur supports-[backdrop-filter]:backdrop-blur border border-border/70 text-foreground"
                : "w-full"
            )}
          >
            {isUser ? (
              <div className="text-foreground max-w-none whitespace-pre-wrap leading-6">{m.content}</div>
            ) : m.pending ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Generating response…</span>
              </div>
            ) : (
              <>
                {m.reasoningPhases && m.reasoningPhases.length > 0 && (
                  <div className="mb-3">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-medium">💭 Reasoning</span>
                      <span className="opacity-70">({m.reasoningPhases.length} phase{m.reasoningPhases.length > 1 ? 's' : ''})</span>
                    </div>
                    <div className="mt-2 space-y-2">
                      {m.reasoningPhases.map((phase, idx) => {
                        const sectionId = `reasoning-${idx}`;
                        const open = isOpen(sectionId);
                        return (
                          <Collapsible 
                            key={idx} 
                            open={open}
                            onOpenChange={() => toggleSection(sectionId, open)}
                            className="group/collapsible"
                          >
                            <CollapsibleTrigger className="flex w-full items-center justify-between text-left text-[13px] rounded-md -mx-1 px-1 py-1 transition-colors hover:bg-muted/60">
                              <span className="font-medium text-primary flex items-center gap-2">
                                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-xs">{idx + 1}</span>
                                {phase.label}
                              </span>
                              <ChevronDown className="h-4 w-4 opacity-60 transition-all duration-200 group-data-[state=open]/collapsible:rotate-180" />
                            </CollapsibleTrigger>
                            <CollapsibleContent className="transition-all duration-200 data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
                              <div className="mt-2 pl-1">
                                <ScrollArea className="h-24 pr-1">
                                  <div className="text-[13px] whitespace-pre-wrap leading-6 text-muted-foreground">{phase.content}</div>
                                </ScrollArea>
                              </div>
                            </CollapsibleContent>
                          </Collapsible>
                        );
                      })}
                    </div>
                  </div>
                )}

                {m.toolCalls && m.toolCalls.length > 0 && (
                  <div className="mb-3">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-medium">🔧 Tool Calls</span>
                      <span className="opacity-70">{m.toolCalls.length}</span>
                    </div>
                    <div className="pt-2 space-y-3">
                      {m.toolCalls.map((tool, idx) => {
                        let prettyArgs = tool.arguments;
                        try {
                          const parsed = JSON.parse(tool.arguments);
                          prettyArgs = JSON.stringify(parsed, null, 2);
                        } catch (_e) { void 0; }
                        const toolResult = m.toolResults && m.toolResults[idx];
                        const sectionId = `tool-${idx}`;
                        const open = isOpen(sectionId);
                        return (
                          <Collapsible 
                            key={idx} 
                            open={open}
                            onOpenChange={() => toggleSection(sectionId, open)}
                            className="group/collapsible"
                          >
                            <CollapsibleTrigger className="flex w-full items-center justify-between text-left text-[13px] text-primary rounded-md -mx-1 px-1 py-1 transition-colors hover:bg-muted/60">
                              <span className="underline-offset-2 hover:underline">{tool.name}</span>
                              <ChevronDown className="h-4 w-4 opacity-60 transition-all duration-200 group-data-[state=open]/collapsible:rotate-180" />
                            </CollapsibleTrigger>
                            <CollapsibleContent className="transition-all duration-200 data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
                              <div className="grid gap-2 mt-2">
                                <div>
                                  <div className="text-[11px] font-medium text-muted-foreground mb-1">Arguments</div>
                                  <ScrollArea className="h-28 rounded-lg border border-border/60 p-2 bg-card/60">
                                    <pre className="text-[13px] whitespace-pre-wrap font-mono text-muted-foreground">{prettyArgs}</pre>
                                  </ScrollArea>
                                </div>
                                {toolResult && (
                                  <div>
                                    <div className="text-[11px] font-medium text-muted-foreground mb-1">Result</div>
                                    <ScrollArea className="h-28 rounded-lg border border-border/60 p-2 bg-card/60">
                                      <pre className="text-[13px] whitespace-pre-wrap font-mono text-muted-foreground">{toolResult}</pre>
                                    </ScrollArea>
                                  </div>
                                )}
                              </div>
                            </CollapsibleContent>
                          </Collapsible>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Chart Sections */}
                {m.charts && m.charts.length > 0 && (
                  <div className="pt-3 pb-2">
                    <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-2">
                      📊 Visualizations ({m.charts.length})
                    </div>
                    <div className="space-y-3">
                      {m.charts.map((chart, idx) => {
                        const sectionId = `chart-${idx}`;
                        const open = isOpen(sectionId);
                        
                        return (
                          <Collapsible 
                            key={idx} 
                            open={open}
                            onOpenChange={() => toggleSection(sectionId, open)}
                            className="group/collapsible"
                          >
                            <CollapsibleTrigger className="flex w-full items-center justify-between text-left text-[13px] rounded-md -mx-1 px-1 py-1 transition-colors hover:bg-muted/60">
                              <span className="font-medium text-foreground">📊 {chart.config.title}</span>
                              <ChevronDown className="h-4 w-4 opacity-60 transition-all duration-200 group-data-[state=open]/collapsible:rotate-180" />
                            </CollapsibleTrigger>
                            <CollapsibleContent className="transition-all duration-200 data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
                              <div className="mt-2">
                                <AgentInlineChart chartData={chart} />
                              </div>
                            </CollapsibleContent>
                          </Collapsible>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="pt-1">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-2">Answer</div>
                  <div className="prose prose-sm dark:prose-invert agent-prose max-w-none leading-6 prose-p:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-strong:font-semibold prose-code:text-[13px]">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        a: ({ node, ...props }) => (
                          <a {...props} target="_blank" rel="noreferrer" />
                        ),
                        table: ({ node, ...props }) => (
                          <div className="overflow-auto max-h-96 rounded-xl border border-border/70 shadow-sm bg-card relative">
                            <table {...props} />
                          </div>
                        ),
                      }}
                    >
                      {m.content || ""}
                    </ReactMarkdown>
                  </div>
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
                        aria-label="Copy answer"
                        className="hover:text-foreground transition-transform active:scale-95"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(m.content);
                            setCopiedId(m.id);
                            toast({ description: "Copied" });
                            window.setTimeout(() => setCopiedId(null), 1200);
                          } catch (e) {
                            console.error(e);
                            toast({ description: "Copy failed" });
                          }
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>{copiedId === m.id ? "Copied" : "Copy"}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <button
                  aria-label="Like answer"
                  aria-pressed={m.feedback === "like"}
                  className={cn(
                    "transition-transform active:scale-95",
                    m.feedback === "like" ? "text-primary" : "hover:text-foreground"
                  )}
                  onClick={() => {
                    const newFeedback = m.feedback === "like" ? undefined : ("like" as const);
                    setMessages((prev) => prev.map((mm) => mm.id === m.id ? { ...mm, feedback: newFeedback } : mm));
                    toast({ description: newFeedback === "like" ? "Marked helpful" : "Feedback cleared" });
                  }}
                >
                  <ThumbsUp className="h-4 w-4" />
                </button>
                <button
                  aria-label="Dislike answer"
                  aria-pressed={m.feedback === "dislike"}
                  className={cn(
                    "transition-transform active:scale-95",
                    m.feedback === "dislike" ? "text-primary" : "hover:text-foreground"
                  )}
                  onClick={() => {
                    const newFeedback = m.feedback === "dislike" ? undefined : ("dislike" as const);
                    setMessages((prev) => prev.map((mm) => mm.id === m.id ? { ...mm, feedback: newFeedback } : mm));
                    toast({ description: newFeedback === "dislike" ? "Marked not helpful" : "Feedback cleared" });
                  }}
                >
                  <ThumbsDown className="h-4 w-4" />
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
        <div className="sticky top-0 z-40 bg-background/70 backdrop-blur supports-[backdrop-filter]:backdrop-blur border-b border-border/60">
          <div className="mx-auto max-w-[736px] w-full flex items-center justify-between px-2 sm:px-0 py-2.5">
            <div className="flex items-center gap-3">
              <Sparkles className="h-5 w-5 text-primary" />
              <div>
                <h2 className="text-lg sm:text-xl font-semibold leading-tight">PVCI Agent</h2>
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
        </div>
        {/* Chat body ensures composer sits at bottom on short pages */}
        <div className="flex flex-col min-h-[calc(100vh-220px)]">
          {/* Messages (page scroll) */}
          <div ref={listRef} className="flex-1 space-y-4 sm:space-y-5 py-3">
            {allMessages.map(renderMessage)}
          </div>

          {/* Composer pinned to bottom of viewport */}
          <div className="sticky bottom-0 z-50 border-t border-border p-4 bg-background/80 backdrop-blur supports-[backdrop-filter]:backdrop-blur pb-[env(safe-area-inset-bottom)]">
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
                isStreaming={loading}
                onStop={stopStreaming}
              />
              <div className="text-center text-[11px] text-muted-foreground mt-2">
                {loading
                  ? "Generating response… Press Esc to stop."
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
