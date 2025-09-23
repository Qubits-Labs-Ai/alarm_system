import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useInsightModal } from "./useInsightModal";
import { getInsight } from '@/api/insights';
import type { InsightMeta } from '@/api/insights';
import { Lightbulb, AlertTriangle, Cpu, Copy, RotateCcw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Button } from '@/components/ui/button';

export const InsightModal = () => {
  const { isOpen, onClose, chartData, chartTitle } = useInsightModal();
  const [insight, setInsight] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const safeTitle = typeof chartTitle === 'string' ? chartTitle : 'Selected Chart';
  const [copied, setCopied] = useState(false);
  const [meta, setMeta] = useState<InsightMeta | undefined>(undefined);

  const handleRegenerate = async () => {
    if (!chartData) return;
    const ok = window.confirm('Regenerate AI insight for the current chart context?');
    if (!ok) return;
    setIsLoading(true);
    setError(null);
    setInsight(null);
    try {
      const result = await getInsight(safeTitle, chartData, { regenerate: true });
      setInsight(result.insight);
      setMeta(result.meta);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to regenerate insight. Please try again later.';
      setError(message);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    if (isOpen && chartData) {
      const fetchInsight = async () => {
        setIsLoading(true);
        setError(null);
        setInsight(null);
        try {
          const result = await getInsight(safeTitle, chartData);
          setInsight(result.insight);
          setMeta(result.meta);
        } catch (err) {
          const message = err instanceof Error ? err.message : "Failed to generate insight. Please try again later.";
          setError(message);
        }
        setIsLoading(false);
      };
      fetchInsight();
    }
  }, [isOpen, chartData, chartTitle, safeTitle]);

  const handleClose = () => {
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      {/* Remove default padding and constrain height; make inner body scroll */}
      <DialogContent className="max-w-3xl w-[90vw] p-0 overflow-hidden">
        {/* Sticky header for title */}
        <DialogHeader className="sticky top-0 z-10 bg-popover/95 backdrop-blur supports-[backdrop-filter]:bg-popover/80 border-b px-6 py-4">
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="flex items-center">
              <Lightbulb className="h-5 w-5 mr-2 text-yellow-500" />
              AI Insight for {safeTitle}
            </DialogTitle>
            <div className="flex items-center gap-2">
              {meta && (
                <span className="text-xs px-2 py-1 rounded bg-accent text-foreground border">
                  {meta.provider === 'gemini' ? `Gemini ${meta.model || ''}` : 'Heuristic Fallback'}{meta.cached ? ' · cached' : ''}
                </span>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleRegenerate}
                disabled={isLoading || !chartData || (Array.isArray(chartData) && chartData.length === 0)}
                title="Re-generate insight"
              >
                <RotateCcw className="h-4 w-4 mr-1" /> Re-generate
              </Button>
            </div>
          </div>
          <DialogDescription className="sr-only">Automatically generated operational insights for the current chart selection.</DialogDescription>
        </DialogHeader>

        {/* Scrollable body */}
        <div className="px-6 py-4 max-h-[70vh] overflow-y-auto">
          <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:mb-2 prose-p:leading-relaxed prose-li:my-0.5">
            {isLoading && (
              <div className="flex flex-col items-center justify-center p-8">
                <Cpu className="h-10 w-10 animate-pulse text-primary" />
                <p className="mt-4 text-muted-foreground">Generating analysis...</p>
              </div>
            )}
            {error && (
              <div className="flex flex-col items-center justify-center p-8 text-destructive">
                <AlertTriangle className="h-10 w-10" />
                <p className="mt-4 font-semibold text-center whitespace-pre-wrap">{error}</p>
              </div>
            )}
            {meta?.provider === 'fallback' && (
              <div className="mb-3 p-3 rounded border text-sm bg-warning/10 border-warning/40 text-foreground">
                <div className="font-medium">Note</div>
                <div>Fallback heuristic insight is shown. {meta?.error ? `Reason: ${meta.error}` : ''}</div>
              </div>
            )}
            {insight && (
              <ReactMarkdown>{insight}</ReactMarkdown>
            )}
          </div>
        </div>

        {/* Footer with copy & close */}
        <div className="flex items-center justify-between gap-2 border-t px-6 py-3 bg-popover/50">
          <span className="text-xs text-muted-foreground">
            {copied ? 'Insight copied to clipboard' : meta ? `${meta.provider === 'gemini' ? 'Generated by Gemini' : 'Heuristic fallback'}${meta.model ? ` • ${meta.model}` : ''}${meta.cached ? ' • cached' : ''}${meta.generated_at ? ` • ${new Date(meta.generated_at).toLocaleString()}` : ''}` : 'AI-generated based on current chart context'}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (insight) {
                  navigator.clipboard?.writeText(insight).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  });
                }
              }}
              disabled={!insight}
            >
              <Copy className="h-4 w-4 mr-1" /> Copy
            </Button>
            <Button size="sm" onClick={handleClose}>Close</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
