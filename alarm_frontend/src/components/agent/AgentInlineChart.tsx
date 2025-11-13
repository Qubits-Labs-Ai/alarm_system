/**
 * AgentInlineChart - Renders charts inline in PVCI Agent responses
 * Supports: line, bar, pie, scatter, area charts
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, ScatterChart, Scatter,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell
} from 'recharts';
import { ChartDataPayload } from '@/api/agentSSE';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface AgentInlineChartProps {
  chartData: ChartDataPayload;
}

export const AgentInlineChart: React.FC<AgentInlineChartProps> = ({ chartData }) => {
  const { type, data, config } = chartData;
  // Theme-aware label color: light mode -> dark text; dark mode -> light text
  const [labelColor, setLabelColor] = useState<string>('#111827');
  const wrapperRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const recompute = () => {
      try {
        const isDark = document.documentElement.classList.contains('dark');
        setLabelColor(isDark ? '#e5e7eb' : '#111827');
      } catch { /* noop */ }
    };
    recompute();
    const moHtml = new MutationObserver(recompute);
    const moBody = new MutationObserver(recompute);
    try {
      moHtml.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
    } catch { /* noop */ }
    try {
      moBody.observe(document.body, { attributes: true, attributeFilter: ['class', 'data-theme'] });
    } catch { /* noop */ }
    let mql: MediaQueryList | null = null;
    const handler = () => recompute();
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      mql = window.matchMedia('(prefers-color-scheme: dark)');
      try { mql.addEventListener('change', handler); } catch { /* noop */ }
    }
    return () => {
      try { moHtml.disconnect(); } catch { /* noop */ }
      try { moBody.disconnect(); } catch { /* noop */ }
      if (mql) {
        try { mql.removeEventListener('change', handler); } catch { /* noop */ }
      }
    };
  }, []);

  type RechartsTickProps = { x: number; y: number; payload: { value: string | number } };
  const XTick: React.FC<RechartsTickProps> = ({ x, y, payload }) => (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={0} dy={16} textAnchor="middle" style={{ fill: labelColor, fillOpacity: 1 }} fontSize={11}>
        {String(payload.value)}
      </text>
    </g>
  );
  const YTick: React.FC<RechartsTickProps> = ({ x, y, payload }) => (
    <g transform={`translate(${x},${y})`}>
      <text x={-4} y={0} dy={4} textAnchor="end" style={{ fill: labelColor, fillOpacity: 1 }} fontSize={11}>
        {String(payload.value)}
      </text>
    </g>
  );

  const renderChart = () => {
    const commonTooltipStyle = {
      contentStyle: {
        background: 'hsl(var(--popover))',
        border: '1px solid hsl(var(--border))',
        borderRadius: '6px',
        fontSize: '13px'
      }
    };

    switch (type) {
      case 'line':
        return (
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
            <XAxis 
              dataKey={config.xKey} 
              label={config.xLabel ? { value: config.xLabel, position: 'insideBottom', offset: -5, style: { fontSize: 12, fill: labelColor } } : undefined}
              tick={<XTick />}
              stroke="hsl(var(--border))"
            />
            <YAxis 
              label={config.yLabel ? { value: config.yLabel, angle: -90, position: 'insideLeft', style: { fontSize: 12, fill: labelColor } } : undefined}
              tick={<YTick />}
              stroke="hsl(var(--border))"
            />
            {config.tooltip && <Tooltip {...commonTooltipStyle} />}
            {config.legend && (
              <Legend
                wrapperStyle={{ fontSize: '12px' }}
                formatter={(value) => <span style={{ color: labelColor }}>{String(value)}</span>}
              />
            )}
            {(config.yKeys || [config.yKey]).filter(Boolean).map((key, idx) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={config.colors?.[idx] || 'hsl(var(--chart-1))'}
                strokeWidth={2}
                dot={{ r: 3, fill: config.colors?.[idx] || 'hsl(var(--chart-1))' }}
                activeDot={{ r: 5 }}
              />
            ))}
          </LineChart>
        );

      case 'bar':
        return (
          <BarChart data={data} layout={config.layout || 'horizontal'} margin={{ left: 20, right: 20, top: 10, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
            {config.layout === 'vertical' ? (
              <>
                <XAxis 
                  type="number" 
                  tick={<XTick />}
                  stroke="hsl(var(--border))"
                />
                <YAxis 
                  type="category" 
                  dataKey={config.xKey} 
                  tick={<YTick />}
                  width={150}
                  stroke="hsl(var(--border))"
                />
              </>
            ) : (
              <>
                <XAxis 
                  dataKey={config.xKey} 
                  tick={<XTick />}
                  stroke="hsl(var(--border))"
                />
                <YAxis 
                  tick={<YTick />}
                  stroke="hsl(var(--border))"
                />
              </>
            )}
            {config.tooltip && <Tooltip {...commonTooltipStyle} />}
            {config.legend && (
              <Legend
                wrapperStyle={{ fontSize: '12px' }}
                formatter={(value) => <span style={{ color: labelColor }}>{String(value)}</span>}
              />
            )}
            {(config.yKeys || [config.yKey]).filter(Boolean).map((key, idx) => (
              <Bar
                key={key}
                dataKey={key}
                fill={config.colors?.[idx] || 'hsl(var(--chart-1))'}
                radius={[4, 4, 0, 0]}
              />
            ))}
          </BarChart>
        );

      case 'pie':
        return (
          <PieChart>
            <Pie
              data={data}
              dataKey={config.valueKey || 'value'}
              nameKey={config.nameKey || 'name'}
              cx="50%"
              cy="50%"
              outerRadius={120}
              label={(props: unknown) => {
                const p = props as { x: number; y: number } & Record<string, unknown>;
                const nKey = (config.nameKey || 'name') as string;
                const vKey = (config.valueKey || 'value') as string;
                const name = String(p[nKey] ?? p['name'] ?? '');
                const value = String(p[vKey] ?? p['value'] ?? '');
                const { x, y } = p;
                return (
                  <text x={x} y={y} fill={labelColor} textAnchor="middle" dominantBaseline="central" fontSize={11}>
                    {`${name}: ${value}`}
                  </text>
                );
              }}
              labelLine={{ stroke: 'hsl(var(--border))' }}
            >
              {data.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={config.colors?.[index % (config.colors?.length || 6)] || 'hsl(var(--chart-1))'} 
                />
              ))}
            </Pie>
            {config.tooltip && <Tooltip {...commonTooltipStyle} />}
            {config.legend && (
              <Legend
                wrapperStyle={{ fontSize: '12px' }}
                formatter={(value) => <span style={{ color: labelColor }}>{String(value)}</span>}
              />
            )}
          </PieChart>
        );

      case 'scatter':
        return (
          <ScatterChart data={data} margin={{ left: 20, right: 20, top: 10, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
            <XAxis 
              dataKey={config.xKey || 'x'}
              type="number"
              label={config.xLabel ? { value: config.xLabel, position: 'insideBottom', offset: -5, style: { fontSize: 12, fill: labelColor } } : undefined}
              tick={<XTick />}
              stroke="hsl(var(--border))"
            />
            <YAxis 
              dataKey={config.yKey || 'y'}
              type="number"
              label={config.yLabel ? { value: config.yLabel, angle: -90, position: 'insideLeft', style: { fontSize: 12, fill: labelColor } } : undefined}
              tick={<YTick />}
              stroke="hsl(var(--border))"
            />
            {config.tooltip && <Tooltip {...commonTooltipStyle} cursor={{ strokeDasharray: '3 3' }} />}
            <Scatter
              data={data}
              fill={config.colors?.[0] || 'hsl(var(--chart-1))'}
            />
          </ScatterChart>
        );

      case 'area':
        return (
          <AreaChart data={data} margin={{ left: 20, right: 20, top: 10, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
            <XAxis 
              dataKey={config.xKey}
              tick={<XTick />}
              stroke="hsl(var(--border))"
            />
            <YAxis 
              tick={<YTick />}
              stroke="hsl(var(--border))"
            />
            {config.tooltip && <Tooltip {...commonTooltipStyle} />}
            {config.legend && (
              <Legend
                wrapperStyle={{ fontSize: '12px' }}
                formatter={(value) => <span style={{ color: labelColor }}>{String(value)}</span>}
              />
            )}
            {(config.yKeys || [config.yKey]).filter(Boolean).map((key, idx) => (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                stroke={config.colors?.[idx] || 'hsl(var(--chart-1))'}
                fill={config.colors?.[idx] || 'hsl(var(--chart-1))'}
                fillOpacity={0.6}
                strokeWidth={2}
              />
            ))}
          </AreaChart>
        );

      default:
        return (
          <div className="text-sm text-muted-foreground p-4 text-center">
            Unsupported chart type: {type}
          </div>
        );
    }
  };

  return (
    <Card className="border border-border/60 shadow-sm">
      <CardHeader className="pb-3 pt-3">
        <CardTitle className="text-sm font-medium text-foreground">
          📊 {config.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-3">
        <div ref={wrapperRef} className="text-foreground">
          <ResponsiveContainer width="100%" height={config.height || 300}>
            {renderChart()}
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};
