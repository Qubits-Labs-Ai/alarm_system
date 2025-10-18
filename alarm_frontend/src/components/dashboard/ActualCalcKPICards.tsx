/**
 * ActualCalcKPICards - Display alarm lifecycle KPIs
 * Shows response times, completion rates, alarm rates, and ISA compliance
 */

import { useState } from 'react';
import { TrendingUp, AlertTriangle, Activity, Calendar, ShieldAlert } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ActualCalcKPIs, ActualCalcCounts, ActualCalcUnhealthyResponse, ActualCalcFloodsResponse } from '@/types/actualCalc';
import { UnhealthyPeriodsModal } from './UnhealthyPeriodsModal';
import { FloodWindowsModal } from './FloodWindowsModal';

interface ActualCalcKPICardsProps {
  kpis: ActualCalcKPIs;
  counts: ActualCalcCounts;
  isLoading?: boolean;
  totals?: {
    total_unhealthy_periods?: number;
    total_flood_windows?: number;
    total_flood_count?: number;
  };
  unhealthyData?: ActualCalcUnhealthyResponse | null;
  floodsData?: ActualCalcFloodsResponse | null;
}

export function ActualCalcKPICards({ kpis, counts, isLoading = false, totals, unhealthyData, floodsData }: ActualCalcKPICardsProps) {
  const [unhealthyModalOpen, setUnhealthyModalOpen] = useState(false);
  const [floodsModalOpen, setFloodsModalOpen] = useState(false);
  // Format minutes to hours:minutes
  const formatTime = (minutes: number): string => {
    if (minutes < 60) return `${minutes.toFixed(1)}m`;
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hours}h ${mins}m`;
  };

  const total = Math.max(1, Number(counts.total_alarms || 0));
  const nuisanceTotal = Number(counts.total_chattering || 0) + Number(counts.total_instrument_failure_chattering || 0);

  const cards = [
    {
      title: 'Total Alarms',
      value: counts.total_alarms.toLocaleString(),
      description: `From ${counts.total_sources.toLocaleString()} sources`,
      icon: Activity,
      trend: 'neutral' as const,
    },
    {
      title: 'Standing Alarms',
      value: (counts.total_standing || 0).toLocaleString(),
      description: 'Alarms standing beyond threshold',
      icon: ShieldAlert,
      trend: (counts.total_standing || 0) === 0 ? 'positive' : (counts.total_standing || 0) / total <= 0.05 ? 'neutral' : 'negative',
    },
    {
      title: 'Nuisance/Repeating Alarms',
      value: nuisanceTotal.toLocaleString(),
      description: 'Chattering and instrument-faulty chattering',
      icon: Activity,
      trend: nuisanceTotal === 0 ? 'positive' : nuisanceTotal / counts.total_alarms <= 0.1 ? 'neutral' : 'negative',
    },
    {
      title: 'Completion Rate',
      value: `${kpis.completion_rate_pct.toFixed(1)}%`,
      description: 'Alarm cycles completed',
      icon: TrendingUp,
      trend: kpis.completion_rate_pct >= 95 ? 'positive' : kpis.completion_rate_pct >= 85 ? 'neutral' : 'negative',
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
    // New Actual-Calc totals (optional)
    ...(totals ? [
      {
        title: 'Unhealthy Periods',
        value: Number(totals.total_unhealthy_periods || 0).toLocaleString(),
        description: '10‑min windows per source over threshold',
        icon: AlertTriangle,
        trend: 'neutral' as const,
      },
      {
        title: 'Flood Windows',
        value: Number(totals.total_flood_windows || 0).toLocaleString(),
        description: 'Windows with ≥2 sources unhealthy',
        icon: Calendar,
        trend: 'neutral' as const,
      },
      {
        title: 'Total Flood Alarms',
        value: Number(totals.total_flood_count || 0).toLocaleString(),
        description: 'Sum of alarms within flood windows',
        icon: Activity,
        trend: 'neutral' as const,
      }
    ] : []),
  ];

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
        {[...Array(cards.length)].map((_, i) => (
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
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
        {cards.map((card) => {
          const Icon = card.icon;
          const isUnhealthyCard = card.title === 'Unhealthy Periods';
          const isFloodCard = card.title === 'Flood Windows';
          const isClickable = (isUnhealthyCard && unhealthyData && !isLoading) || (isFloodCard && floodsData && !isLoading);
          
          return (
            <Card 
              key={card.title} 
              className={`shadow-metric-card bg-dashboard-metric-card-bg h-full min-h-[140px] flex flex-col ${
                isClickable ? 'cursor-pointer transition-all hover:shadow-lg hover:scale-[1.02]' : ''
              }`}
              onClick={() => {
                if (isUnhealthyCard && unhealthyData && !isLoading) {
                  setUnhealthyModalOpen(true);
                } else if (isFloodCard && floodsData && !isLoading) {
                  setFloodsModalOpen(true);
                }
              }}
            >
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
                  {isClickable && (
                    <span className="block mt-1 text-primary font-medium">Click for details →</span>
                  )}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Unhealthy Periods Modal */}
      <UnhealthyPeriodsModal
        open={unhealthyModalOpen}
        onOpenChange={setUnhealthyModalOpen}
        data={unhealthyData ? {
          total_periods: unhealthyData.total_periods,
          per_source: unhealthyData.per_source,
          params: unhealthyData.params,
        } : null}
      />

      {/* Flood Windows Modal */}
      <FloodWindowsModal
        open={floodsModalOpen}
        onOpenChange={setFloodsModalOpen}
        data={floodsData ? {
          totals: floodsData.totals,
          windows: floodsData.windows,
          params: floodsData.params,
        } : null}
      />
    </>
  );
}
