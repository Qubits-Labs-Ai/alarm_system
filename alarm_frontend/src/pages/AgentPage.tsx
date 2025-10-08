import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { PageShell } from "@/components/dashboard/PageShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Sparkles, ArrowLeft, Copy, ThumbsUp, ThumbsDown, Share2, RotateCcw, MoreHorizontal, Bot, Loader2 } from "lucide-react";
import { TextGenerateEffect } from "@/components/ui/text-generate-effect";
import ReactMarkdown from "react-markdown";
import { PlaceholdersAndVanishInput } from "@/components/ui/placeholders-and-vanish-input";

type ChatRole = "assistant" | "user";
type ChatMessage = { id: string; role: ChatRole; content: string; pending?: boolean; animate?: boolean };

const WelcomeMarkdown = `I'm your PVC-I alarm management assistant.

I'm here to help you with:

- Analyzing alarm floods and unhealthy sources
- Summarizing peak 10-minute windows (ISA-18 method)
- Explaining locations, conditions, priorities and actions
- Providing recommendations to improve alarm performance

What can I help you tackle today?`;

const AgentPage = () => {
  const { plant } = useParams();
  const navigate = useNavigate();
  const plantId = String(plant || "").toLowerCase();
  const isSupported = plantId === "pvci"; // currently enabled only for PVC-I

  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    { id: "m-welcome", role: "assistant", content: WelcomeMarkdown },
  ]);
  const [input, setInput] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [animatedDone, setAnimatedDone] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Identity reply (professional template tailored to project)
  const IDENTITY_RESPONSE = `I'm the PVC‑I Alarm Management Copilot, an AI assistant built by Qbit Dynamics.
\nI'm here to help you with:\n
📊 Analyzing alarm floods and unhealthy sources (per‑source & plant‑wide)\n
🔍 Summarizing peak 10‑minute windows using the ISA‑18 method (PVC‑I method)\n
📈 Creating insights and reports: top offenders, locations, priorities & actions\n
📚 Explaining locations, conditions, priorities and recommended actions\n
🎯 Providing actionable recommendations to improve alarm performance & compliance\n
🧩 Linking the right dashboard views and data for faster diagnostics\n
I work with your current datasets (alarm events, ISA summaries, source histories, etc.) and help you make data‑driven decisions to keep operations safe and efficient.\n
What plant health question can I help you tackle today?`;

  // Friendly greeting reply for short greetings (Urdu/English)
  const GREETING_RESPONSE = `Assalam o Alaikum! Main aap ka PVC‑I Alarm Management Copilot hoon.

You can ask in Urdu or English. Try one of these:

- Show peak flood windows (ISA‑18)
- Top unhealthy sources right now
- Explain location VS-1309 high flood
- What priorities are most impacted?

Bas ek line me apni need likhen; main short, cited jawab dunga.`;

  const isGreetingQuery = (q: string) => {
    const s = q.trim().toLowerCase().replace(/[!.,]/g, "");
    const greetings = [
      "hi",
      "hello",
      "hey",
      "salam",
      "salaam",
      "assalam",
      "asalam",
      "assalamu alaikum",
      "assalamualaikum",
      "salam alaikum",
      "salam o alaikum",
      "as-salamu alaykum",
      "aoa",
    ];
    return greetings.includes(s);
  };

  const isIdentityQuery = (q: string) => {
    const s = q.toLowerCase();
    return (
      /\bwho\s*are\s*you\b/.test(s) ||
      /\bwho\s*r\s*u\b/.test(s) ||
      /\bwhich\s*(model|agent)\b/.test(s) ||
      /\bwhat\s*(model|agent)\b/.test(s) ||
      /\bwhat\s+is\s+(your\s+)?(work|working|role|function)\b/.test(s) ||
      /\byour\s+(capabilities|abilities)\b/.test(s)
    );
  };

  // auto-scroll to bottom (page-level feel)
  useEffect(() => {
    // Try to scroll the last message into view
    const el = listRef.current?.lastElementChild as HTMLElement | null;
    el?.scrollIntoView({ behavior: "smooth", block: "end" });
    // Also nudge window scroll for environments without an internal scroller
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    });
  }, [messages.length]);

  const askAgent = async (query: string, pendingId: string) => {
    setLoading(true);
    try {
      const envBase = (import.meta as any)?.env?.VITE_API_URL as string | undefined;
      const API_BASES = [
        envBase || "",
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
      ].filter(Boolean) as string[];

      let lastErr: any = null;
      for (const base of API_BASES) {
        try {
          const res = await fetch(`${base}/agent/pvci/ask`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query }),
          });
          if (!res.ok) {
            const errText = await res.text().catch(() => "");
            lastErr = new Error(errText || `HTTP ${res.status}`);
            continue;
          }
          const data = await res.json().catch(() => ({}));
          const content: string = (data?.answer || "").trim() || "Not available in current data.";
          setMessages((m) => m.map((mm) => (mm.id === pendingId ? { ...mm, content, pending: false, animate: true } : mm)));
          lastErr = null;
          break;
        } catch (inner) {
          lastErr = inner;
          continue;
        }
      }
      if (lastErr) throw lastErr;
    } catch (e: any) {
      const msg = (e?.message || String(e) || "Request failed").slice(0, 500);
      setMessages((m) => m.map((mm) => (mm.id === pendingId ? { ...mm, content: `Error contacting agent API. ${msg}`, pending: false, animate: false } : mm)));
    } finally {
      setLoading(false);
    }
  };

  const send = () => {
    const text = input.trim();
    if (!text) return;
    if (loading) return; // block multiple concurrent sends
    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: "user", content: text };
    const pendingId = `a-pending-${Date.now()}`;
    const pendingMsg: ChatMessage = { id: pendingId, role: "assistant", content: "Generating response…", pending: true };
    setMessages((m) => [...m, userMsg, pendingMsg]);
    setInput("");
    // Local greeting response (do not call backend for a simple 'hi/hello/salam')
    if (isGreetingQuery(text)) {
      setMessages((m) => m.map((mm) => (mm.id === pendingId ? { ...mm, content: GREETING_RESPONSE, pending: false, animate: true } : mm)));
      return;
    }
    // Local identity response only; other queries will be handled once backend is wired
    if (isIdentityQuery(text)) {
      // Replace the pending bubble with identity response
      setMessages((m) => m.map((mm) => (mm.id === pendingId ? { ...mm, content: IDENTITY_RESPONSE, pending: false, animate: true } : mm)));
      return;
    }
    // Call backend agent for all other queries
    void askAgent(text, pendingId);
  };

  const renderMessage = (m: ChatMessage) => {
    const isUser = m.role === "user";
    return (
      <div key={m.id} className={`group flex w-full ${isUser ? "justify-end" : "justify-start"}`}>
        <div className={`mx-auto max-w-[736px] w-full flex ${isUser ? "flex-row-reverse" : "flex-row"} items-start gap-4 px-2 sm:px-0`}>
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
            className={`${
              isUser
                ? "w-fit max-w-[90%] md:max-w-[85%] ml-6 sm:ml-10"
                : "w-full"
            } rounded-3xl px-4 py-3 shadow-sm break-words ${
              isUser
                ? "bg-[#7eb653] dark:bg-[#496930] text-white border-transparent"
                : "bg-primary/5 text-foreground border-primary/15 border"
            }`}
          >
            {isUser ? (
              <div className="text-white max-w-none whitespace-pre-wrap leading-6">{m.content}</div>
            ) : m.pending ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Generating response…</span>
              </div>
            ) : m.animate && !animatedDone[m.id] ? (
              <TextGenerateEffect
                words={m.content}
                duration={Math.min(3.5, Math.max(1.2, m.content.length / 140))}
                filter={false}
                className="prose prose-sm dark:prose-invert max-w-none leading-6"
                onDone={() => setAnimatedDone((prev) => ({ ...prev, [m.id]: true }))}
              />
            ) : (
              <div className="prose prose-sm dark:prose-invert max-w-none leading-6 prose-p:my-2 prose-ul:my-1 prose-li:my-0.5">
                <ReactMarkdown
                  components={{
                    ul: ({ node, ...props }) => <ul className="list-disc pl-5" {...props} />,
                    li: ({ node, ...props }) => <li className="my-0.5" {...props} />,
                  }}
                >
                  {m.content}
                </ReactMarkdown>
              </div>
            )}
            {!isUser && (
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

  if (!isSupported) {
    return (
      <PageShell>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Bot className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold">Agent Assistant (Unavailable)</h2>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate("/dashboard")}> 
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
          </Button>
        </div>
        <Card className="bg-card border-border p-8 text-muted-foreground">Agent is only available for PVC-I at the moment.</Card>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="flex flex-col gap-3">
      {/* Header (sticky below global navbar) */}
      <div className="flex items-center justify-between sticky z-40 bg-background backdrop-blur supports-[backdrop-filter]:backdrop-blur py-2 border-b border-border/60">
        <div className="flex items-center gap-3 ">
          <Sparkles className="h-5 w-5 text-primary" />
          <div>
            <h2 className="text-xl font-semibold">PVC-I Agent</h2>
            <p className="text-xs text-muted-foreground">Minimal, clean chat experience</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setMessages([{ id: "m-welcome", role: "assistant", content: WelcomeMarkdown }])}>Clear</Button>
          <Button variant="outline" size="sm" onClick={() => navigate("/dashboard")}> 
            <ArrowLeft className="mr-2 h-4 w-4" /> Dashboard
          </Button>
        </div>
      </div>
      {/* Chat body ensures composer sits at bottom on short pages */}
      <div className="flex flex-col min-h-[calc(100vh-220px)]">
        {/* Messages (page scroll) */}
        <div ref={listRef} className="flex-1 space-y-5 sm:space-y-6 py-4">
          {messages.map(renderMessage)}
        </div>

        {/* Composer pinned to bottom of viewport */}
        <div className="sticky bottom-0 border-t border-border p-4 bg-background backdrop-blur supports-[backdrop-filter]:backdrop-blur pb-[env(safe-area-inset-bottom)]">
          <div className="mx-auto max-w-[736px] w-full">
            <PlaceholdersAndVanishInput
              placeholders={[
                "Who are you?",
                "Show peak flood windows (ISA-18)",
                "Top unhealthy sources right now",
                "Explain location VS-1309 high flood",
                "What priorities are most impacted?",
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
                ? "Generating response… sending disabled until completion."
                : "Press Enter to send. Shift+Enter adds a new line. PVC‑I Agent can make mistakes—verify important information."}
            </div>
          </div>
        </div>
      </div>
      </div>
    </PageShell>
  );
};

export default AgentPage;
