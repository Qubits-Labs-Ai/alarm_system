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
        <XAxis dataKey="name" tick={{ fill: colors.textColor, fontSize: 12 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: colors.textColor, fontSize: 12 }} axisLine={false} tickLine={false} />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: colors.tooltipCursor }} />
        <Bar dataKey="value" fill={colors.primary} radius={[8, 8, 0, 0]} />
      </BarChart>
    ),
  },
  {
    id: 'pareto',
    data: generateParetoData(),
    component: (data: any[], colors: any) => (
      <ComposedChart data={data}>
        <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
        <XAxis dataKey="name" tick={{ fill: colors.textColor, fontSize: 12 }} axisLine={false} tickLine={false} />
        <YAxis yAxisId="left" tick={{ fill: colors.textColor, fontSize: 12 }} axisLine={false} tickLine={false} />
        <YAxis yAxisId="right" orientation="right" tick={{ fill: 'var(--warning)', fontSize: 12 }} tickFormatter={(tick) => `${tick}%`} domain={[0, 100]} axisLine={false} tickLine={false} />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: colors.tooltipCursor }} />
        <Bar yAxisId="left" dataKey="count" fill={colors.primary} radius={[8, 8, 0, 0]} />
        <Line yAxisId="right" type="monotone" dataKey="cumulative" stroke="var(--warning)" strokeWidth={3} dot={{ r: 5, fill: 'var(--warning)' }} />
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
          <Legend wrapperStyle={{ fontSize: '12px', color: colors.textColor }} />
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
    // We rely on CSS variables for text colors to ensure they update correctly 
    // regardless of the component's local theme state (which might be out of sync)

    return {
      background: 'var(--card)',
      foreground: 'var(--card-foreground)',
      border: 'var(--border)',
      mutedForeground: 'var(--muted-foreground)', // Removed incorrect hsl() wrapper
      textColor: 'var(--muted-foreground)', // Use CSS variable for automatic theme switching
      primary: greenPalette[1] || 'var(--primary)', // Use CSS variable as fallback
      secondary: '#d11308',
      tooltipCursor: 'transparent',
      donut: {},
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
    <div className="relative w-full h-[400px] p-6 bg-card/90 border-2 border-primary/30 rounded-2xl shadow-2xl shadow-primary/20 backdrop-blur-md overflow-hidden group hover:border-primary/50 hover:shadow-primary/30 transition-all duration-500">
      {/* Animated gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-lime-accent/5 opacity-50 group-hover:opacity-70 transition-opacity duration-500" />

      {/* Glow effect on hover */}
      <div className="absolute inset-0 bg-gradient-to-tr from-primary/0 via-primary/10 to-lime-accent/0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 blur-xl" />

      <AnimatePresence mode="wait">
        <motion.div
          key={chartIndex}
          initial={{ opacity: 0, scale: 0.9, rotateX: 10, filter: 'blur(10px)' }}
          animate={{ opacity: 1, scale: 1, rotateX: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, scale: 0.9, rotateX: -10, filter: 'blur(10px)' }}
          transition={{ duration: 0.7, ease: [0.4, 0, 0.2, 1] }}
          className="w-full h-full relative z-10"
        >
          <ResponsiveContainer width="100%" height="100%">
            {currentChart.component(currentChart.data, colors)}
          </ResponsiveContainer>
        </motion.div>
      </AnimatePresence>

      {/* Chart indicators with enhanced styling */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-3 z-20">
        {charts.map((_, index) => (
          <motion.div
            key={index}
            className={`h-2 rounded-full transition-all duration-500 ${chartIndex === index
              ? 'w-8 bg-primary shadow-lg shadow-primary/50'
              : 'w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50'
              }`}
            whileHover={{ scale: 1.2 }}
          />
        ))}
      </div>
    </div>
  );
};

export default AnimatedChartDisplay;
