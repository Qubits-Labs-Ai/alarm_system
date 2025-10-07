import { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, ComposedChart, Line, PieChart, Pie, Cell, Legend } from 'recharts';
import { AnimatePresence, motion } from 'framer-motion';
import { useTheme } from '@/hooks/useTheme';
import { getGreenPalette } from '@/theme/chartColors';
import { CustomTooltip } from './ChartTooltip';

// --- Data Generation ---
const generateBarData = () => Array.from({ length: 8 }, (_, i) => ({
  name: `SRC-${i + 1}`,
  value: Math.floor(Math.random() * (200 - 20 + 1)) + 20,
}));

const generateParetoData = () => {
  const rawData = Array.from({ length: 6 }, (_, i) => ({
    name: `Cause ${String.fromCharCode(65 + i)}`,
    count: Math.floor(Math.random() * 100) + 10,
  })).sort((a, b) => b.count - a.count);

  const total = rawData.reduce((acc, item) => acc + item.count, 0);
  let cumulative = 0;
  return rawData.map(item => {
    cumulative += item.count;
    return { ...item, cumulative: (cumulative / total) * 100 };
  });
};

const generateDonutData = () => [
  { name: 'Critical', value: 400 + Math.random() * 50 },
  { name: 'High', value: 300 + Math.random() * 50 },
  { name: 'Medium', value: 200 + Math.random() * 50 },
  { name: 'Low', value: 100 + Math.random() * 50 },
];

// --- Chart Components ---
const charts = [
  {
    id: 'bar',
    data: generateBarData(),
    component: (data: any[], colors: any) => (
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
        <XAxis dataKey="name" tick={{ fill: colors.mutedForeground, fontSize: 12 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: colors.mutedForeground, fontSize: 12 }} axisLine={false} tickLine={false} />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: colors.tooltipCursor }} />
        <Bar dataKey="value" fill={colors.primary} />
      </BarChart>
    ),
  },
  {
    id: 'pareto',
    data: generateParetoData(),
    component: (data: any[], colors: any) => (
      <ComposedChart data={data}>
        <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
        <XAxis dataKey="name" tick={{ fill: colors.mutedForeground, fontSize: 12 }} axisLine={false} tickLine={false} />
        <YAxis yAxisId="left" tick={{ fill: colors.mutedForeground, fontSize: 12 }} axisLine={false} tickLine={false} />
        <YAxis yAxisId="right" orientation="right" tick={{ fill: 'var(--warning)', fontSize: 12 }} tickFormatter={(tick) => `${tick}%`} domain={[0, 100]} axisLine={false} tickLine={false} />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: colors.tooltipCursor }} />
        <Bar yAxisId="left" dataKey="count" fill={colors.primary} />
        <Line yAxisId="right" type="monotone" dataKey="cumulative" stroke="var(--warning)" strokeWidth={2} dot={{ r: 4 }} />
      </ComposedChart>
    ),
  },
  {
    id: 'donut',
    data: generateDonutData(),
    component: (data: any[], colors: any) => {
      // Use theme tokens to stay consistent in light/dark modes
      const donutColorMap: { [key: string]: string } = {
        Critical: 'var(--destructive)',
        High: 'var(--warning)',
        Medium: 'hsl(var(--chart-3))',
        Low: 'hsl(var(--chart-2))',
      };

      return (
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={80} outerRadius={110} paddingAngle={5} fill={colors.primary}>
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={donutColorMap[entry.name] || colors.primary} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: '12px', color: colors.mutedForeground }} />
        </PieChart>
      );
    },
  },
];

// --- Main Component ---
const AnimatedChartDisplay = () => {
  const { theme } = useTheme();
  const [chartIndex, setChartIndex] = useState(0);
  const [chartData, setChartData] = useState(charts.map(c => ({ ...c, data: c.data })));
  const colors = useMemo(() => {
    const greenPalette = getGreenPalette(4);
    const isDark = document.documentElement.classList.contains('dark');

    return {
      background: 'hsl(var(--card))',
      foreground: 'hsl(var(--card-foreground))',
      border: 'hsl(var(--border))',
      mutedForeground: 'hsl(var(--muted-foreground))',
      primary: greenPalette[1] || (isDark ? 'oklch(0.68 0.12 140)' : 'oklch(0.55 0.15 140)'),
      secondary: '#d11308', // Use a direct hex value for orange to ensure it always renders
      tooltipCursor: 'transparent',
      donut: {}, // Colors are now handled directly in the component
    };
  }, [theme]);

  useEffect(() => {
    const cycleTimer = setInterval(() => {
      setChartIndex(prev => (prev + 1) % charts.length);
    }, 5000);

    const dataTimer = setInterval(() => {
      setChartData([
        { ...charts[0], data: generateBarData() },
        { ...charts[1], data: generateParetoData() },
        { ...charts[2], data: generateDonutData() },
      ]);
    }, 3000);

    return () => {
      clearInterval(cycleTimer);
      clearInterval(dataTimer);
    };
  }, []);

    const currentChart = chartData[chartIndex];


  return (
    <div className="relative w-full h-[400px] p-4 bg-card/80 border-2 border-border rounded-xl shadow-2xl shadow-primary/10 backdrop-blur-sm overflow-hidden">
      <AnimatePresence mode="wait">
        <motion.div
          key={chartIndex}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.5, ease: 'easeInOut' }}
          className="w-full h-full"
        >
          <ResponsiveContainer width="100%" height="100%">
            {currentChart.component(currentChart.data, colors)}
          </ResponsiveContainer>
        </motion.div>
      </AnimatePresence>
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
        {charts.map((_, index) => (
          <div key={index} className={`w-2 h-2 rounded-full transition-all duration-300 ${chartIndex === index ? 'bg-primary' : 'bg-muted'}`} />
        ))}
      </div>
    </div>
  );
};

export default AnimatedChartDisplay;
