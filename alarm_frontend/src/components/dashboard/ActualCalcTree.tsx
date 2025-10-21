/**
 * ActualCalcTree - Minimal flow/tree view with connectors
 * Root: Total Alarms → Standing Alarm, Nuisance/Repeating
 * Standing → (Instruments Faulty, Stale Alarms)
 * Nuisance/Repeating → (Chattering Alarms, Instruments Faulty)
 */

import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ActualCalcOverallResponse } from '@/types/actualCalc';

type Props = {
  data: ActualCalcOverallResponse;
  standingTotal?: number; // optional override
  instrumentsFaultyTotal?: number; // optional override
  instrumentsFaultyChatteringTotal?: number; // optional override for chattering instruments faulty
  staleTotal?: number; // optional override
};

function StatNode({ title, value, nodeRef }: { title: string; value: number; nodeRef: React.RefObject<HTMLDivElement> }) {
  return (
    <div ref={nodeRef} className="inline-block relative">
      <Card className="shadow-metric-card bg-dashboard-metric-card-bg min-w-[160px] sm:min-w-[200px] md:min-w-[220px]">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground text-center truncate">
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-xl sm:text-2xl font-bold text-center">
            {Number(value || 0).toLocaleString()}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function ActualCalcTree({ data, standingTotal: standingOverride = 0, instrumentsFaultyTotal: faultyOverride = 0, instrumentsFaultyChatteringTotal: faultyChatteringOverride = 0, staleTotal: staleOverride = 0 }: Props) {
  const totalAlarms = Number(data?.counts?.total_alarms || 0);
  const standingTotal = Number(data?.counts?.total_standing ?? standingOverride ?? 0);
  const instrumentsFaultyTotal = Number(data?.counts?.total_instrument_failure ?? faultyOverride ?? 0);
  const staleTotal = Number(data?.counts?.total_stale ?? staleOverride ?? 0);
  const chatteringTotal = Number(data?.counts?.total_chattering || 0);
  const instrumentsFaultyChatteringTotal = Number(data?.counts?.total_instrument_failure_chattering ?? faultyChatteringOverride ?? 0);
  const nuisanceTotal = chatteringTotal + instrumentsFaultyChatteringTotal;

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
    const raf = requestAnimationFrame(compute);
    window.addEventListener('resize', compute);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', compute);
    };
  }, [totalAlarms, standingTotal, instrumentsFaultyTotal, chatteringTotal]);

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
          <StatNode title="Standing Alarm" value={standingTotal} nodeRef={standingRef} />
        </div>
        <div className="flex justify-center">
          <StatNode title="Nuisance/Repeating Alarms" value={nuisanceTotal} nodeRef={nuisanceRef} />
        </div>
      </div>

      {/* Row 3: Children of Standing and Nuisance */}
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-2 md:grid-cols-4 md:gap-16 items-start max-w-7xl mx-auto">
        <div className="flex justify-center order-1 md:order-1">
          <StatNode title="Instruments Faulty" value={instrumentsFaultyTotal} nodeRef={faultyRef} />
        </div>
        <div className="flex justify-center order-3 md:order-2">
          <StatNode title="Stale Alarms" value={staleTotal} nodeRef={staleRef} />
        </div>
        <div className="flex justify-center order-2 md:order-3">
          <StatNode title="Chattering Alarms" value={chatteringTotal} nodeRef={chatteringRef} />
        </div>
        <div className="flex justify-center order-4 md:order-4">
          <StatNode title="Instruments Faulty (Chattering)" value={instrumentsFaultyChatteringTotal} nodeRef={faultyChatteringRef} />
        </div>
      </div>
    </div>
  );
}
