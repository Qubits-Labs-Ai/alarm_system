/**
 * AgentInlineChart - Renders charts inline in PVCI Agent responses
 * Supports: line, bar, pie, scatter, area charts
 */

import React from 'react';
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
              label={config.xLabel ? { value: config.xLabel, position: 'insideBottom', offset: -5, style: { fontSize: 12 } } : undefined}
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              stroke="hsl(var(--border))"
            />
            <YAxis 
              label={config.yLabel ? { value: config.yLabel, angle: -90, position: 'insideLeft', style: { fontSize: 12 } } : undefined}
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              stroke="hsl(var(--border))"
            />
            {config.tooltip && <Tooltip {...commonTooltipStyle} />}
            {config.legend && <Legend wrapperStyle={{ fontSize: '12px' }} />}
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
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  stroke="hsl(var(--border))"
                />
                <YAxis 
                  type="category" 
                  dataKey={config.xKey} 
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  width={150}
                  stroke="hsl(var(--border))"
                />
              </>
            ) : (
              <>
                <XAxis 
                  dataKey={config.xKey} 
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  stroke="hsl(var(--border))"
                />
                <YAxis 
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  stroke="hsl(var(--border))"
                />
              </>
            )}
            {config.tooltip && <Tooltip {...commonTooltipStyle} />}
            {config.legend && <Legend wrapperStyle={{ fontSize: '12px' }} />}
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
              label={(entry) => {
                const name = entry[config.nameKey || 'name'];
                const value = entry[config.valueKey || 'value'];
                return `${name}: ${value}`;
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
            {config.legend && <Legend wrapperStyle={{ fontSize: '12px' }} />}
          </PieChart>
        );

      case 'scatter':
        return (
          <ScatterChart data={data} margin={{ left: 20, right: 20, top: 10, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
            <XAxis 
              dataKey={config.xKey || 'x'}
              type="number"
              label={config.xLabel ? { value: config.xLabel, position: 'insideBottom', offset: -5, style: { fontSize: 12 } } : undefined}
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              stroke="hsl(var(--border))"
            />
            <YAxis 
              dataKey={config.yKey || 'y'}
              type="number"
              label={config.yLabel ? { value: config.yLabel, angle: -90, position: 'insideLeft', style: { fontSize: 12 } } : undefined}
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
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
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              stroke="hsl(var(--border))"
            />
            <YAxis 
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              stroke="hsl(var(--border))"
            />
            {config.tooltip && <Tooltip {...commonTooltipStyle} />}
            {config.legend && <Legend wrapperStyle={{ fontSize: '12px' }} />}
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
        <ResponsiveContainer width="100%" height={config.height || 300}>
          {renderChart()}
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};
