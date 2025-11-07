/**
 * ActualCalcKPICards - Display alarm lifecycle KPIs
 * Shows response times, completion rates, alarm rates, and ISA compliance
 */

import { useState } from 'react';
import { TrendingUp, AlertTriangle, Activity, Calendar, ShieldAlert, LucideIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ActualCalcKPIs, ActualCalcCounts, ActualCalcUnhealthyResponse, ActualCalcFloodsResponse, ActualCalcBadActorsResponse } from '@/types/actualCalc';
import { UnhealthyPeriodsModal } from './UnhealthyPeriodsModal';
import { FloodWindowsModal } from './FloodWindowsModal';
import { BadActorsModal } from './BadActorsModal';

interface KPICard {
  title: string;
  value: string;
  description: string;
  icon: LucideIcon;
  trend: 'positive' | 'neutral' | 'negative';
}

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
  badActorsData?: ActualCalcBadActorsResponse | null;
  section?: 'alarm' | 'frequency' | 'analytics'; // Optional: render only this section's cards
}

export function ActualCalcKPICards({ kpis, counts, isLoading = false, totals, unhealthyData, floodsData, badActorsData, section }: ActualCalcKPICardsProps) {
  const [unhealthyModalOpen, setUnhealthyModalOpen] = useState(false);
  const [floodsModalOpen, setFloodsModalOpen] = useState(false);
  const [badActorsModalOpen, setBadActorsModalOpen] = useState(false);
  // Format minutes to hours:minutes
  const formatTime = (minutes: number): string => {
    if (minutes < 60) return `${minutes.toFixed(1)}m`;
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hours}h ${mins}m`;
  };

  // Use activation-based counts for consistency with charts (per-activation counts)
  // Fall back to episode-based counts (per-source counts) for backward compatibility
  const countsAny = counts as unknown as { activation_based?: {
    total_activations?: number;
    total_standing?: number;
    total_nuisance?: number;
  }};
  const activationCounts = countsAny.activation_based;
  const uniqueTotal = Number(kpis?.total_unique_alarms ?? 0);
  const totalAlarms = Number(
    (uniqueTotal && uniqueTotal > 0 ? uniqueTotal : (activationCounts?.total_activations))
      ?? counts.total_alarms
      ?? 0
  );
  const standingTotal = Number(activationCounts?.total_standing ?? counts.total_standing ?? 0);
  const nuisanceTotal = Number(activationCounts?.total_nuisance ?? 
    (counts.total_chattering || 0) + (counts.total_instrument_failure_chattering || 0));
  const total = Math.max(1, totalAlarms);

  // Calculate trends
  const standingTrend: 'positive' | 'neutral' | 'negative' = 
    standingTotal === 0 ? 'positive' : standingTotal / total <= 0.05 ? 'neutral' : 'negative';
  const nuisanceTrend: 'positive' | 'neutral' | 'negative' = 
    nuisanceTotal === 0 ? 'positive' : nuisanceTotal / totalAlarms <= 0.1 ? 'neutral' : 'negative';

  // Section 1: Alarm Summary
  const alarmSummaryCards: KPICard[] = [
    {
      title: 'Total Alarms',
      value: totalAlarms.toLocaleString(),
      description: `From ${counts.total_sources.toLocaleString()} sources`,
      icon: Activity,
      trend: 'neutral',
    },
    {
        title: 'Total Flood Alarms',
        value: Number(totals?.total_flood_count || 0).toLocaleString(),
        description: 'Sum of alarms within flood windows',
        icon: Activity,
        trend: 'neutral',
    },
    {
      title: 'Standing Alarms',
      value: standingTotal.toLocaleString(),
      description: 'Alarms standing beyond threshold',
      icon: ShieldAlert,
      trend: standingTrend,
    },
    {
      title: 'Nuisance/Repeating Alarms',
      value: nuisanceTotal.toLocaleString(),
      description: 'Chattering and instrument-faulty chattering',
      icon: Activity,
      trend: nuisanceTrend,
    },
  ];

  // Calculate frequency trends
  const dailyTrend: 'positive' | 'neutral' | 'negative' = 
    kpis.avg_alarms_per_day <= 288 ? 'positive' : kpis.avg_alarms_per_day <= 720 ? 'neutral' : 'negative';
  const hourlyTrend: 'positive' | 'neutral' | 'negative' = 
    kpis.avg_alarms_per_hour <= 12 ? 'positive' : kpis.avg_alarms_per_hour <= 30 ? 'neutral' : 'negative';
  const tenMinTrend: 'positive' | 'neutral' | 'negative' = 
    kpis.avg_alarms_per_10min <= 10 ? 'positive' : kpis.avg_alarms_per_10min <= 50 ? 'neutral' : 'negative';
  const isaTrend: 'positive' | 'neutral' | 'negative' = 
    kpis.days_over_288_alarms_pct <= 10 ? 'positive' : kpis.days_over_288_alarms_pct <= 30 ? 'neutral' : 'negative';
  const criticalTrend: 'positive' | 'neutral' | 'negative' = 
    kpis.days_unacceptable_pct === 0 ? 'positive' : kpis.days_unacceptable_pct <= 5 ? 'neutral' : 'negative';

  // Section 2: Frequency Metrics (Time-based)
  const frequencyMetricsCards: KPICard[] = [
    {
      title: 'Alarm Rate (Daily)',
      value: `${kpis.avg_alarms_per_day.toFixed(1)}/day`,
      description: 'ISO/EEMUA 191 - Average per day',
      icon: Calendar,
      trend: dailyTrend,
    },
    {
      title: 'Alarm Rate (Hourly)',
      value: `${kpis.avg_alarms_per_hour.toFixed(1)}/hour`,
      description: 'ISO/EEMUA 191 - Average per hour',
      icon: Activity,
      trend: hourlyTrend,
    },
    {
      title: 'Alarm Rate (10min)',
      value: `${kpis.avg_alarms_per_10min.toFixed(1)}/10min`,
      description: 'ISO/EEMUA 191 - Average per 10 minutes',
      icon: TrendingUp,
      trend: tenMinTrend,
    },
    {
      title: 'ISA Compliance',
      value: `${(100 - kpis.days_over_288_alarms_pct).toFixed(1)}%`,
      description: `Days under 288 alarms/day${kpis.total_days_analyzed ? ` (${kpis.total_days_analyzed} days analyzed)` : ''}`,
      icon: Calendar,
      trend: isaTrend,
    },
    ...(typeof kpis.days_unacceptable_pct === 'number' ? [{
      title: 'Critical Overload',
      value: `${kpis.days_unacceptable_pct.toFixed(1)}%`,
      description: `Days ≥720 alarms/day (${kpis.days_unacceptable_count || 0} days)`,
      icon: AlertTriangle,
      trend: criticalTrend,
    }] : []),
  ];

  // Section 3: Detailed Analytics (Clickable)
  const detailedAnalyticsCards: KPICard[] = totals ? [
      {
        title: 'Unhealthy Periods',
        value: Number(totals?.total_unhealthy_periods || 0).toLocaleString(),
        description: '10‑min windows per source over threshold',
        icon: AlertTriangle,
        trend: 'neutral',
      },
      {
        title: 'Flood Windows',
        value: Number(totals?.total_flood_windows || 0).toLocaleString(),
        description: 'Windows with ≥2 sources unhealthy',
        icon: Calendar,
        trend: 'neutral',
      },
      {
        title: 'Bad Actors',
        value: Number(badActorsData?.total_actors || 0).toLocaleString(),
        description: 'Top sources driving flood alarms',
        icon: ShieldAlert,
        trend: 'neutral',
      }
    ] : [];

  const renderCardSection = (cards: KPICard[], sectionTitle: string) => (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h3 className="text-lg font-semibold text-foreground">{sectionTitle}</h3>
        <div className="flex-1 h-px bg-border"></div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          const isUnhealthyCard = card.title === 'Unhealthy Periods';
          const isFloodCard = card.title === 'Flood Windows';
          const isBadActorsCard = card.title === 'Bad Actors';
          const isClickable = (isUnhealthyCard && unhealthyData && !isLoading) || (isFloodCard && floodsData && !isLoading) || (isBadActorsCard && badActorsData && !isLoading);
          
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
                } else if (isBadActorsCard && badActorsData && !isLoading) {
                  setBadActorsModalOpen(true);
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
    </div>
  );

  if (isLoading) {
    return (
      <div className="space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
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
      </div>
    );
  }

  // Determine which sections to render based on the section prop
  const shouldRenderAlarm = !section || section === 'alarm';
  const shouldRenderFrequency = !section || section === 'frequency';
  const shouldRenderAnalytics = !section || section === 'analytics';

  return (
    <>
      <div className="space-y-8">
        {/* Section 1: Alarm Summary */}
        {shouldRenderAlarm && renderCardSection(alarmSummaryCards, 'Alarm Summary')}

        {/* Section 2: Frequency Metrics */}
        {shouldRenderFrequency && renderCardSection(frequencyMetricsCards, 'Frequency Metrics')}

        {/* Section 3: Detailed Analytics */}
        {shouldRenderAnalytics && detailedAnalyticsCards.length > 0 && renderCardSection(detailedAnalyticsCards, 'Detailed Analytics')}
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

      {/* Bad Actors Modal */}
      <BadActorsModal
        open={badActorsModalOpen}
        onOpenChange={setBadActorsModalOpen}
        data={badActorsData ? {
          total_actors: badActorsData.total_actors,
          top_actors: badActorsData.top_actors,
          totalFloodCount: totals?.total_flood_count || floodsData?.totals?.total_flood_count,
        } : null}
      />
    </>
  );
}
