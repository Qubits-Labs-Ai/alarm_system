import { AlertCircle, CheckCircle, Activity, FileCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface EventStatistics {
  summary: {
    total_records: number;
    actual_alarms: number;
    actual_alarms_pct: number;
    events: number;
    events_pct: number;
  };
  by_action: {
    operator_actions: {
      acknowledgements: { count: number };
      resets: { count: number };
      shelve_suppress: { count: number };
      other: { count: number };
    };
  };
  by_condition: {
    breakdown: {
      alarm_conditions: { count: number };
      state_changes: { count: number };
      quality_issues: { count: number };
      other: { count: number };
    };
  };
}

interface EventStatisticsCardsProps {
  eventStats: EventStatistics | null | undefined;
  isLoading?: boolean;
}

export function EventStatisticsCards({ eventStats, isLoading = false }: EventStatisticsCardsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="shadow-metric-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="h-4 w-24 bg-muted animate-pulse rounded" />
              <div className="h-4 w-4 bg-muted animate-pulse rounded" />
            </CardHeader>
            <CardContent>
              <div className="h-8 w-16 bg-muted animate-pulse rounded mb-2" />
              <div className="h-3 w-32 bg-muted animate-pulse rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!eventStats || !eventStats.summary) {
    return null;
  }

  const { summary, by_action, by_condition } = eventStats;

  const cards = [
    {
      title: 'Total Records',
      value: summary.total_records.toLocaleString(),
      description: 'All CSV records processed',
      icon: FileCheck,
      trend: 'neutral' as const,
      subtext: `${summary.actual_alarms.toLocaleString()} alarms + ${summary.events.toLocaleString()} events`,
    },
    {
      title: 'Actual Alarms',
      value: `${summary.actual_alarms_pct.toFixed(1)}%`,
      count: summary.actual_alarms.toLocaleString(),
      description: 'True alarm occurrences',
      icon: AlertCircle,
      trend: 'positive' as const,
      subtext: 'Used for ISA 18.2 health',
    },
    {
      title: 'Operator Actions',
      value: (by_action.operator_actions.acknowledgements.count + 
              by_action.operator_actions.resets.count).toLocaleString(),
      description: 'ACK + OK/Reset actions',
      icon: CheckCircle,
      trend: 'neutral' as const,
      subtext: `${by_action.operator_actions.acknowledgements.count.toLocaleString()} ACK, ${by_action.operator_actions.resets.count.toLocaleString()} OK`,
    },
    {
      title: 'System Events',
      value: summary.events_pct.toFixed(1) + '%',
      count: summary.events.toLocaleString(),
      description: 'Non-alarm events',
      icon: Activity,
      trend: 'neutral' as const,
      subtext: 'State changes, quality issues',
    },
  ];

  return (
    <div className="space-y-4">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Event Statistics</h3>
          <p className="text-sm text-muted-foreground">
            Breakdown of actual alarms vs operator actions and system events
          </p>
        </div>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.title} className="shadow-metric-card bg-dashboard-metric-card-bg">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
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
              <CardContent>
                <div className="text-2xl font-bold text-foreground mb-1">
                  {card.value}
                </div>
                {card.count && (
                  <div className="text-sm font-medium text-foreground mb-1">
                    {card.count} records
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  {card.description}
                </p>
                {card.subtext && (
                  <p className="text-xs text-muted-foreground mt-1 opacity-70">
                    {card.subtext}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Detailed Breakdown - Optional Expansion */}
      <Card className="shadow-metric-card bg-dashboard-metric-card-bg">
        <CardHeader>
          <CardTitle className="text-sm font-medium">Classification Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm ">
            {/* Alarm Conditions */}
            <div className="border border-muted-foreground rounded-2xl p-4">
              <div className="font-medium text-foreground mb-2 ">Alarm Conditions</div>
              <div className="space-y-1 text-muted-foreground">
                <div className="flex justify-between">
                  <span>Alarm states (HI, LO, etc.)</span>
                  <span className="font-mono">{by_condition.breakdown.alarm_conditions.count.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* State Changes */}
            <div className="border border-muted-foreground rounded-2xl p-4">
              <div className="font-medium text-foreground mb-2">State Changes</div>
              <div className="space-y-1 text-muted-foreground">
                <div className="flex justify-between">
                  <span>CHANGE, NORMAL, RTN</span>
                  <span className="font-mono">{by_condition.breakdown.state_changes.count.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Quality Issues */}
            <div className="border border-muted-foreground rounded-2xl p-4">
              <div className="font-medium text-foreground mb-2">Quality Issues</div>
              <div className="space-y-1 text-muted-foreground">
                <div className="flex justify-between">
                  <span>BAD PV, COMM, etc.</span>
                  <span className="font-mono">{by_condition.breakdown.quality_issues.count.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
