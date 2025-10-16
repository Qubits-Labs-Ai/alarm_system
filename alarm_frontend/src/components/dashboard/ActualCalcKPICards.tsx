/**
 * ActualCalcKPICards - Display alarm lifecycle KPIs
 * Shows response times, completion rates, alarm rates, and ISA compliance
 */

import { Clock, CheckCircle2, TrendingUp, AlertTriangle, Activity, Calendar } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ActualCalcKPIs, ActualCalcCounts } from '@/types/actualCalc';

interface ActualCalcKPICardsProps {
  kpis: ActualCalcKPIs;
  counts: ActualCalcCounts;
  isLoading?: boolean;
}

export function ActualCalcKPICards({ kpis, counts, isLoading = false }: ActualCalcKPICardsProps) {
  // Format minutes to hours:minutes
  const formatTime = (minutes: number): string => {
    if (minutes < 60) return `${minutes.toFixed(1)}m`;
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hours}h ${mins}m`;
  };

  const cards = [
    {
      title: 'Avg ACK Time',
      value: formatTime(kpis.avg_ack_delay_min),
      description: 'Average acknowledgment delay',
      icon: Clock,
      trend: kpis.avg_ack_delay_min <= 15 ? 'positive' : kpis.avg_ack_delay_min <= 60 ? 'neutral' : 'negative',
    },
    {
      title: 'Avg OK Time',
      value: formatTime(kpis.avg_ok_delay_min),
      description: 'Average resolution time',
      icon: CheckCircle2,
      trend: kpis.avg_ok_delay_min <= 60 ? 'positive' : kpis.avg_ok_delay_min <= 180 ? 'neutral' : 'negative',
    },
    {
      title: 'Completion Rate',
      value: `${kpis.completion_rate_pct.toFixed(1)}%`,
      description: 'Alarm cycles completed',
      icon: TrendingUp,
      trend: kpis.completion_rate_pct >= 95 ? 'positive' : kpis.completion_rate_pct >= 85 ? 'neutral' : 'negative',
    },
    {
      title: 'Stale Alarms',
      value: counts.total_stale.toLocaleString(),
      description: 'Alarms with no action',
      icon: AlertTriangle,
      trend: counts.total_stale === 0 ? 'positive' : counts.total_stale / counts.total_alarms <= 0.05 ? 'neutral' : 'negative',
    },
    {
      title: 'Chattering',
      value: counts.total_chattering.toLocaleString(),
      description: 'Rapid repeated alarms',
      icon: Activity,
      trend: counts.total_chattering === 0 ? 'positive' : counts.total_chattering / counts.total_alarms <= 0.1 ? 'neutral' : 'negative',
    },
    {
      title: 'Alarm Rate',
      value: `${kpis.avg_alarms_per_10min.toFixed(1)}/10min`,
      description: 'Average alarm frequency',
      icon: TrendingUp,
      trend: kpis.avg_alarms_per_10min <= 10 ? 'positive' : kpis.avg_alarms_per_10min <= 50 ? 'neutral' : 'negative',
    },
    {
      title: 'ISA Compliance',
      value: `${(100 - kpis.days_over_288_alarms_pct).toFixed(1)}%`,
      description: 'Days under 288 alarms/day',
      icon: Calendar,
      trend: kpis.days_over_288_alarms_pct <= 10 ? 'positive' : kpis.days_over_288_alarms_pct <= 30 ? 'neutral' : 'negative',
    },
    {
      title: 'Total Alarms',
      value: counts.total_alarms.toLocaleString(),
      description: `From ${counts.total_sources.toLocaleString()} sources`,
      icon: Activity,
      trend: 'neutral' as const,
    },
  ];

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
        {[...Array(8)].map((_, i) => (
          <Card key={i} className="shadow-metric-card h-full min-h-[140px] flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="h-4 w-24 bg-muted animate-pulse rounded" />
              <div className="h-4 w-4 bg-muted animate-pulse rounded" />
            </CardHeader>
            <CardContent className="mt-auto">
              <div className="h-8 w-16 bg-muted animate-pulse rounded mb-2" />
              <div className="h-3 w-32 bg-muted animate-pulse rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Card key={card.title} className="shadow-metric-card bg-dashboard-metric-card-bg h-full min-h-[140px] flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground truncate">
                {card.title}
              </CardTitle>
              <Icon 
                className={`h-4 w-4 ${
                  card.trend === 'positive' 
                    ? 'text-success' 
                    : card.trend === 'negative' 
                    ? 'text-destructive' 
                    : 'text-muted-foreground'
                }`} 
              />
            </CardHeader>
            <CardContent className="mt-auto">
              <div className="text-2xl font-bold text-foreground mb-1">
                {card.value}
              </div>
              <p className="text-xs text-muted-foreground leading-tight whitespace-normal break-words">
                {card.description}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
