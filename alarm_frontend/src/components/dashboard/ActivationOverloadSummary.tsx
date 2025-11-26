import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ShieldAlert, AlertTriangle, Activity, Info } from 'lucide-react';
import type { ActualCalcKPIs, ActualCalcOverallResponse } from '@/types/actualCalc';
import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { fetchPvciActualCalcPeakDetails } from '@/api/actualCalc';
import type { PeakDetailsResponse } from '@/types/actualCalc';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';

interface Props {
  overall: ActualCalcKPIs;
  params?: ActualCalcOverallResponse['params'];
}

export default function ActivationOverloadSummary({ overall, params }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [details, setDetails] = useState<PeakDetailsResponse | null>(null);

  const health = Number(overall.activation_overall_health_pct ?? 0);
  const overloadPct = Number(overall.activation_time_in_overload_windows_pct ?? 0);
  const unacceptablePct = Number(overall.activation_time_in_unacceptable_windows_pct ?? 0);
  const totalWindows = Number(overall.total_activation_windows ?? 0);
  const overloadCount = Number(overall.overload_windows_count ?? 0);
  const unacceptableCount = Number(overall.unacceptable_windows_count ?? 0);
  // Coverage (minutes) — present when backend is aligned to Actual‑Calc sliding windows
  const totalMinutes = Number(overall.total_observation_minutes ?? 0);
  const overloadMinutes = Number(overall.overload_time_minutes ?? 0);
  const unacceptableMinutes = Number(overall.unacceptable_time_minutes ?? 0);
  const hasCoverage = totalMinutes > 0;
  const peakCount = Number(overall.peak_10min_activation_count ?? 0);
  const peakStart = overall.peak_10min_window_start ? new Date(overall.peak_10min_window_start) : null;
  const peakEnd = overall.peak_10min_window_end ? new Date(overall.peak_10min_window_end) : null;

  const overloadOp = params?.act_window_overload_op ?? '>';
  const overloadThr = params?.act_window_overload_threshold ?? 2;
  const unaccOp = params?.act_window_unacceptable_op ?? '>=';
  const unaccThr = params?.act_window_unacceptable_threshold ?? 5;

  const healthColor = health >= 95 ? 'text-success' : health >= 80 ? 'text-amber-500' : 'text-destructive';

  const peakStartISO = useMemo(() => (overall.peak_10min_window_start || ''), [overall.peak_10min_window_start]);
  const peakEndISO = useMemo(() => (overall.peak_10min_window_end || ''), [overall.peak_10min_window_end]);

  useEffect(() => {
    if (!open) return;
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const res = await fetchPvciActualCalcPeakDetails({
          start_iso: peakStartISO || undefined,
          end_iso: peakEndISO || undefined,
          timeout_ms: 30000,
        });
        if (!mounted) return;
        setDetails(res);
      } catch {
        if (mounted) setDetails(null);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [open, peakStartISO, peakEndISO]);

  return (
    <TooltipProvider>
    <Card className="shadow-metric-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Flood-Free Time (10-min windows)</CardTitle>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="text-muted-foreground hover:text-foreground" aria-label="Flood-Free Time info">
                  <Info className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" align="start" className="max-w-[320px]">
                <div className="text-xs">
                  Flood‑Free Time = 100 − Overload Time. Based on Actual‑Calc unique activations using a sliding 10‑min window and time coverage. Overload if count {overloadOp} {overloadThr}. Unacceptable if {unaccOp} {unaccThr}.
                </div>
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="text-xs text-muted-foreground">
            Overload: {overloadOp} {overloadThr} · Unacceptable: {unaccOp} {unaccThr}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
          <div className="space-y-3">
            <div className={`text-4xl font-bold ${healthColor}`}>{health.toFixed(2)}%</div>
            <div className="text-xs text-muted-foreground">Time Without Alarm Floods (100 − % time in overload windows)</div>
            <Progress value={Math.max(0, Math.min(100, health))} className="h-2" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg border p-4">
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs text-muted-foreground">Overload Time</div>
                <div className="flex items-center gap-1">
                  <Activity className="h-3.5 w-3.5 text-muted-foreground" />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="text-muted-foreground hover:text-foreground" aria-label="Overload Time info">
                        <Info className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" align="end" className="max-w-[320px]">
                      <div className="text-xs">
                        % of observation time covered by sliding 10‑min windows where unique activations {overloadOp} {overloadThr}. If coverage fields are missing, fallback shows fixed-bin window counts.
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>
              <div className="text-2xl font-semibold">{overloadPct.toFixed(2)}%</div>
              <div className="text-xs text-muted-foreground">
                {hasCoverage
                  ? `${Math.round(overloadMinutes).toLocaleString()} / ${Math.round(totalMinutes).toLocaleString()} min`
                  : `${overloadCount.toLocaleString()} / ${totalWindows.toLocaleString()} windows`}
              </div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs text-muted-foreground">Unacceptable Time</div>
                <div className="flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="text-muted-foreground hover:text-foreground" aria-label="Unacceptable Time info">
                        <Info className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" align="end" className="max-w-[320px]">
                      <div className="text-xs">
                        % of observation time covered by sliding 10‑min windows where unique activations {unaccOp} {unaccThr}. If coverage fields are missing, fallback shows fixed-bin window counts.
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>
              <div className="text-2xl font-semibold">{unacceptablePct.toFixed(2)}%</div>
              <div className="text-xs text-muted-foreground">
                {hasCoverage
                  ? `${Math.round(unacceptableMinutes).toLocaleString()} / ${Math.round(totalMinutes).toLocaleString()} min`
                  : `${unacceptableCount.toLocaleString()} / ${totalWindows.toLocaleString()} windows`}
              </div>
            </div>
          </div>

          <div className="rounded-lg border p-4">
            <div className="flex items-center justify-between mb-1">
              <div className="text-xs text-muted-foreground">Peak 10‑min Window</div>
              <div className="flex items-center gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="text-muted-foreground hover:text-foreground" aria-label="Peak window info">
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" align="end" className="max-w-[320px]">
                    <div className="text-xs">
                      Maximum unique activations observed in any fixed 10‑minute window. Counts unique activations, not raw events.
                    </div>
                  </TooltipContent>
                </Tooltip>
                <button
                  type="button"
                  onClick={() => setOpen(true)}
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  title="View details"
                >
                  <Info className="h-3.5 w-3.5" /> Details
                </button>
              </div>
            </div>
            <div className="text-2xl font-semibold">{peakCount}</div>
            <div className="text-xs text-muted-foreground">
              {peakStart && peakEnd ? `${peakStart.toLocaleString()} — ${peakEnd.toLocaleString()}` : 'N/A'}
            </div>
          </div>
        </div>

        {/* Peak Details Modal */}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Activation Peak Details</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">
                Window: {peakStart ? peakStart.toLocaleString() : peakStartISO} — {peakEnd ? peakEnd.toLocaleString() : peakEndISO}
              </div>
              <div className="text-sm">
                <span className="text-muted-foreground">Total unique activations:</span> <span className="font-semibold">{details?.total ?? peakCount}</span>
              </div>
              <div className="border rounded">
                <div className="max-h-72 overflow-auto text-sm">
                  {loading ? (
                    <div className="p-3 text-muted-foreground">Loading top sources…</div>
                  ) : (details && details.top_sources && details.top_sources.length > 0) ? (
                    <ul>
                      {details.top_sources.map((s) => (
                        <li key={s.source} className="flex items-center justify-between px-3 py-2 border-b last:border-b-0">
                          <span className="truncate pr-3">{s.source}</span>
                          <span className="font-mono">{s.count}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="p-3 text-muted-foreground">No sources found for this window.</div>
                  )}
                </div>
              </div>
              <div className="text-xs text-muted-foreground">These counts are unique activations (ISO/EEMUA style), not raw events.</div>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
    </TooltipProvider>
  );
}
