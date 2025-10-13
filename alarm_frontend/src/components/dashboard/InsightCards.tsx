import { TrendingUp, TrendingDown, Database, FileText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PlantHealthMetrics } from '@/types/dashboard';

interface InsightCardsProps {
  metrics: PlantHealthMetrics;
  isLoading?: boolean;
  mode?: 'perSource' | 'flood';
}

export function InsightCards({ metrics, isLoading = false, mode = 'perSource' }: InsightCardsProps) {
  const isFlood = mode === 'flood';
  const cards = isFlood
    ? [
        {
          title: 'ISA Health',
          value: `${metrics.healthy_percentage.toFixed(1)}%`,
          description: 'Plant health (ISA 18.2)',
          icon: TrendingUp,
          trend: 'positive' as const,
        },
        {
          title: '% Time In Flood',
          value: `${metrics.unhealthy_percentage.toFixed(1)}%`,
          description: 'Time under flood',
          icon: TrendingDown,
          trend: 'negative' as const,
        },
        {
          title: 'Flood Windows',
          value: metrics.total_sources.toLocaleString(),
          description: 'Flood intervals detected',
          icon: Database,
          trend: 'neutral' as const,
        },
        {
          title: 'Total Alarms',
          value: metrics.total_files.toLocaleString(),
          description: 'Alarms in period',
          icon: FileText,
          trend: 'neutral' as const,
        },
      ]
    : [
        {
          title: 'Healthy Sources',
          value: `${metrics.healthy_percentage.toFixed(1)}%`,
          description: 'Sources within normal range',
          icon: TrendingUp,
          trend: 'positive' as const,
        },
        {
          title: 'Unhealthy Sources',
          value: `${metrics.unhealthy_percentage.toFixed(1)}%`,
          description: 'Sources requiring attention',
          icon: TrendingDown,
          trend: 'negative' as const,
        },
        {
          title: 'Total Sources',
          value: metrics.total_sources.toLocaleString(),
          description: 'Active monitoring points',
          icon: Database,
          trend: 'neutral' as const,
        },
        {
          title: 'Total Files',
          value: metrics.total_files.toLocaleString(),
          description: 'Files processed',
          icon: FileText,
          trend: 'neutral' as const,
        },
      ];

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
        {[...Array(4)].map((_, i) => (
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