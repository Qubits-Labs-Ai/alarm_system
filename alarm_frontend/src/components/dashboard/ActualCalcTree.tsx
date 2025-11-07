/**
 * ActualCalcTree - Minimal flow/tree view with connectors
 * Root: Total Alarms → Standing Alarm, Nuisance/Repeating
 * Standing → (Instruments Faulty, Stale Alarms)
 * Nuisance/Repeating → (Chattering Alarms, Instruments Faulty)
 */

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ActualCalcOverallResponse } from '@/types/actualCalc';
import { fetchPlantActualCalcSankey } from '@/api/actualCalc';

type Props = {
  data: ActualCalcOverallResponse;
  plantId: string;
  includeSystem?: boolean;
  standingTotal?: number; // optional override
  instrumentsFaultyTotal?: number; // optional override
  instrumentsFaultyChatteringTotal?: number; // optional override for chattering instruments faulty
  staleTotal?: number; // optional override
};

function StatNode({ title, value, nodeRef, bg, split }: { title: string; value: number; nodeRef: React.RefObject<HTMLDivElement>; bg?: string; split?: { operational: number; system: number } }) {
  return (
    <div ref={nodeRef} className="inline-block relative">
      <Card
        className="shadow-metric-card bg-dashboard-metric-card-bg min-w-[160px] sm:min-w-[200px] md:min-w-[220px] border"
        style={bg ? ({ background: bg } as CSSProperties) : undefined}
      >
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground text-center truncate">
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-xl sm:text-2xl font-bold text-center">
            {Number(value || 0).toLocaleString()}
          </div>
          {split && (split.operational > 0 || split.system > 0) && (
            <div className="mt-3">
              <div className="h-2 w-full rounded bg-muted overflow-hidden border border-border">
                <div
                  className="h-full bg-primary/70"
                  style={{ width: `${Math.max(0, Math.min(100, (split.operational / Math.max(1, split.operational + split.system)) * 100))}%` }}
                />
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                <div className="flex items-center justify-start gap-1">
                  <span className="inline-block w-2 h-2 rounded-sm" style={{ background: 'var(--primary)' }} />
                  <span>Operational</span>
                  <span className="text-foreground font-medium ml-1">{Number(split.operational || 0).toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-end gap-1">
                  <span className="inline-block w-2 h-2 rounded-sm" style={{ background: 'var(--muted-foreground)' }} />
                  <span>System</span>
                  <span className="text-foreground font-medium ml-1">{Number(split.system || 0).toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function ActualCalcTree({ data, plantId, includeSystem = true, standingTotal: standingOverride = 0, instrumentsFaultyTotal: faultyOverride = 0, instrumentsFaultyChatteringTotal: faultyChatteringOverride = 0, staleTotal: staleOverride = 0 }: Props) {
  // Use activation-based counts for consistency with charts (per-activation counts)
  // Fall back to episode-based counts (per-source counts) for backward compatibility
  const activationCounts = data?.counts?.activation_based;
  const uniqueTotal = Number(data?.overall?.total_unique_alarms || 0);
  const totalAlarms = Number(
    (uniqueTotal && uniqueTotal > 0 ? uniqueTotal : (activationCounts?.total_activations))
    ?? data?.counts?.total_alarms
    ?? 0
  );

  // Refs for nodes
  const containerRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const standingRef = useRef<HTMLDivElement>(null);
  const nuisanceRef = useRef<HTMLDivElement>(null);
  const faultyRef = useRef<HTMLDivElement>(null);
  const staleRef = useRef<HTMLDivElement>(null);
  const chatteringRef = useRef<HTMLDivElement>(null);

  const [paths, setPaths] = useState<string[]>([]);
  const faultyChatteringRef = useRef<HTMLDivElement>(null);

  // Sankey totals to compute Operational vs System splits
  const [sankeyOp, setSankeyOp] = useState<null | {
    standing: number;
    standing_stale: number;
    standing_if: number;
    nuisance: number;
    nuisance_chattering: number;
    nuisance_if_chattering: number;
    flood: number;
    other: number;
  }>(null);
  const [sankeyAll, setSankeyAll] = useState<typeof sankeyOp>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [op, all] = await Promise.all([
          fetchPlantActualCalcSankey(plantId, { include_system: false, timeout_ms: 360000 }),
          fetchPlantActualCalcSankey(plantId, { include_system: true, timeout_ms: 360000 }),
        ]);
        if (cancelled) return;
        setSankeyOp({
          standing: op.totals.standing,
          standing_stale: op.totals.standing_stale,
          standing_if: op.totals.standing_if,
          nuisance: op.totals.nuisance,
          nuisance_chattering: op.totals.nuisance_chattering,
          nuisance_if_chattering: op.totals.nuisance_if_chattering,
          flood: op.totals.flood,
          other: op.totals.other,
        });
        setSankeyAll({
          standing: all.totals.standing,
          standing_stale: all.totals.standing_stale,
          standing_if: all.totals.standing_if,
          nuisance: all.totals.nuisance,
          nuisance_chattering: all.totals.nuisance_chattering,
          nuisance_if_chattering: all.totals.nuisance_if_chattering,
          flood: all.totals.flood,
          other: all.totals.other,
        });
      } catch {
        // ignore errors; splits just won't render
      }
    }
    if (plantId) load();
    return () => { cancelled = true; };
  }, [plantId]);

  // Derive node values (prefer Sankey with includeSystem toggle). Fallback to activation/counts if unavailable.
  const preferred = includeSystem ? sankeyAll : sankeyOp;
  const fallbackStanding = Number(activationCounts?.total_standing ?? data?.counts?.total_standing ?? standingOverride ?? 0);
  const fallbackStale = Number(activationCounts?.total_standing_stale ?? data?.counts?.total_stale ?? staleOverride ?? 0);
  const fallbackFaultStanding = Number(activationCounts?.total_standing_if ?? data?.counts?.total_instrument_failure ?? faultyOverride ?? 0);
  const fallbackChat = Number(activationCounts?.total_nuisance_chattering ?? data?.counts?.total_chattering ?? 0);
  const fallbackIFChat = Number(activationCounts?.total_nuisance_if_chattering ?? data?.counts?.total_instrument_failure_chattering ?? faultyChatteringOverride ?? 0);

  const standingTotal = Number(preferred?.standing ?? fallbackStanding);
  const staleTotal = Number(preferred?.standing_stale ?? fallbackStale);
  const instrumentsFaultyTotal = Number(preferred?.standing_if ?? fallbackFaultStanding);
  const chatteringTotal = Number(preferred?.nuisance_chattering ?? fallbackChat);
  const instrumentsFaultyChatteringTotal = Number(preferred?.nuisance_if_chattering ?? fallbackIFChat);
  const nuisanceTotal = chatteringTotal + instrumentsFaultyChatteringTotal;

  const sysSplit = (allV?: number, opV?: number) => {
    const a = Math.max(0, Number(allV || 0));
    const o = Math.max(0, Number(opV || 0));
    const sys = Math.max(0, a - o);
    return { operational: o, system: sys };
  };

  const scaledSplit = (nodeTotal: number, allV?: number, opV?: number) => {
    const a = Math.max(0, Number(allV || 0));
    const o = Math.max(0, Number(opV || 0));
    const s = Math.max(0, a - o);
    const denom = a > 0 ? a : o + s;
    if (denom <= 0 || nodeTotal <= 0) return { operational: 0, system: 0 };
    const opScaled = Math.round((o / denom) * nodeTotal);
    const sysScaled = Math.max(0, nodeTotal - opScaled);
    return { operational: opScaled, system: sysScaled };
  };

  useEffect(() => {
    const compute = () => {
      const c = containerRef.current;
      if (!c) return;

      const rectC = c.getBoundingClientRect();
      const centerBottom = (el: HTMLElement): { x: number; y: number } => {
        const r = el.getBoundingClientRect();
        return {
          x: r.left - rectC.left + r.width / 2,
          y: r.bottom - rectC.top,
        };
      };
      const centerTop = (el: HTMLElement): { x: number; y: number } => {
        const r = el.getBoundingClientRect();
        return {
          x: r.left - rectC.left + r.width / 2,
          y: r.top - rectC.top,
        };
      };

      const makePath = (fromEl: HTMLElement | null, toEl: HTMLElement | null) => {
        if (!fromEl || !toEl) return '';
        const a = centerBottom(fromEl);
        const b = centerTop(toEl);
        const midY = (a.y + b.y) / 2;
        return `M ${a.x} ${a.y} V ${midY} H ${b.x} V ${b.y}`;
      };

      const p1 = makePath(rootRef.current, standingRef.current);
      const p2 = makePath(rootRef.current, nuisanceRef.current);
      const p3 = makePath(standingRef.current, faultyRef.current);
      const p4 = makePath(standingRef.current, staleRef.current);
      const p5 = makePath(nuisanceRef.current, chatteringRef.current);
      const p6 = makePath(nuisanceRef.current, faultyChatteringRef.current);
      setPaths([p1, p2, p3, p4, p5, p6].filter(Boolean));
    };

    // compute after mount and on resize
    let raf: number | null = null;
    const schedule = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(compute);
    };
    schedule();
    window.addEventListener('resize', schedule);

    const ro = new ResizeObserver(() => schedule());
    const els = [
      rootRef.current,
      standingRef.current,
      nuisanceRef.current,
      faultyRef.current,
      staleRef.current,
      chatteringRef.current,
      faultyChatteringRef.current,
      containerRef.current,
    ].filter(Boolean) as HTMLElement[];
    els.forEach((el) => ro.observe(el));

    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('resize', schedule);
      ro.disconnect();
    };
  }, [totalAlarms, standingTotal, instrumentsFaultyTotal, chatteringTotal, staleTotal, instrumentsFaultyChatteringTotal, sankeyOp, sankeyAll]);

  const values = [
    standingTotal,
    nuisanceTotal,
    instrumentsFaultyTotal,
    staleTotal,
    chatteringTotal,
    instrumentsFaultyChatteringTotal,
  ];
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const band = (v: number) => {
    const t = maxV === minV ? 0.5 : (v - minV) / (maxV - minV);
    if (t >= 0.8) return { color: 'var(--destructive)', pct: 36 };
    if (t >= 0.55) return { color: 'var(--warning)', pct: 24 };
    if (t >= 0.3) return { color: 'var(--ring)', pct: 12 };
    return { color: 'var(--metric-card-bg)', pct: 0 };
  };
  const mixBg = (colorVar: string, pct: number) => pct > 0
    ? `color-mix(in oklch, ${colorVar} ${pct}%, var(--metric-card-bg))`
    : undefined;

  const { color: cStand, pct: pStand } = band(standingTotal);
  const { color: cNuis, pct: pNuis } = band(nuisanceTotal);
  const { color: cFault, pct: pFault } = band(instrumentsFaultyTotal);
  const { color: cStl, pct: pStl } = band(staleTotal);
  const { color: cCh, pct: pCh } = band(chatteringTotal);
  const { color: cFCh, pct: pFCh } = band(instrumentsFaultyChatteringTotal);

  const bgStanding = mixBg(cStand, pStand);
  const bgNuisance = mixBg(cNuis, pNuis);
  const bgFaulty = mixBg(cFault, pFault);
  const bgStale = mixBg(cStl, pStl);
  const bgChat = mixBg(cCh, pCh);
  const bgFaultyChat = mixBg(cFCh, pFCh);

  return (
    <div ref={containerRef} className="relative w-full mx-auto overflow-hidden px-2 sm:px-0">
      {/* SVG connectors */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" stroke="#94a3b8" fill="none" strokeWidth={1.5}>
        {paths.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </svg>

      {/* Row 1: Root */}
      <div className="flex justify-center mb-10">
        <StatNode title="Total Alarms" value={totalAlarms} nodeRef={rootRef} />
      </div>

      {/* Row 2: Standing | Nuisance */}
      <div className="grid grid-cols-2 gap-6 md:grid-cols-2 md:gap-16 items-start max-w-5xl mx-auto mb-10">
        <div className="flex justify-center">
          <StatNode
            title="Standing Alarm"
            value={standingTotal}
            nodeRef={standingRef}
            bg={bgStanding}
            split={sankeyOp && sankeyAll ? scaledSplit(standingTotal, sankeyAll.standing, sankeyOp.standing) : undefined}
          />
        </div>
        <div className="flex justify-center">
          <StatNode
            title="Nuisance/Repeating Alarms"
            value={nuisanceTotal}
            nodeRef={nuisanceRef}
            bg={bgNuisance}
            split={
              sankeyOp && sankeyAll
                ? scaledSplit(
                    nuisanceTotal,
                    (sankeyAll.nuisance_chattering + sankeyAll.nuisance_if_chattering),
                    (sankeyOp.nuisance_chattering + sankeyOp.nuisance_if_chattering)
                  )
                : undefined
            }
          />
        </div>
      </div>

      {/* Row 3: Children of Standing and Nuisance */}
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-2 md:grid-cols-4 md:gap-16 items-start max-w-7xl mx-auto">
        <div className="flex justify-center order-1 md:order-1">
          <StatNode
            title="Instruments Faulty"
            value={instrumentsFaultyTotal}
            nodeRef={faultyRef}
            bg={bgFaulty}
            split={sankeyOp && sankeyAll ? scaledSplit(instrumentsFaultyTotal, sankeyAll.standing_if, sankeyOp.standing_if) : undefined}
          />
        </div>
        <div className="flex justify-center order-3 md:order-2">
          <StatNode
            title="Stale Alarms"
            value={staleTotal}
            nodeRef={staleRef}
            bg={bgStale}
            split={sankeyOp && sankeyAll ? scaledSplit(staleTotal, sankeyAll.standing_stale, sankeyOp.standing_stale) : undefined}
          />
        </div>
        <div className="flex justify-center order-2 md:order-3">
          <StatNode
            title="Chattering Alarms"
            value={chatteringTotal}
            nodeRef={chatteringRef}
            bg={bgChat}
            split={sankeyOp && sankeyAll ? scaledSplit(chatteringTotal, sankeyAll.nuisance_chattering, sankeyOp.nuisance_chattering) : undefined}
          />
        </div>
        <div className="flex justify-center order-4 md:order-4">
          <StatNode
            title="Instruments Faulty (Chattering)"
            value={instrumentsFaultyChatteringTotal}
            nodeRef={faultyChatteringRef}
            bg={bgFaultyChat}
            split={sankeyOp && sankeyAll ? scaledSplit(instrumentsFaultyChatteringTotal, sankeyAll.nuisance_if_chattering, sankeyOp.nuisance_if_chattering) : undefined}
          />
        </div>
      </div>
    </div>
  );
}
