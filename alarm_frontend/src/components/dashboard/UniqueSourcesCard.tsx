import React from 'react';
import { Users, TrendingUp, TrendingDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface UniqueSourcesData {
  totalUnique: number;
  healthySources: number;   // < 10 hits
  unhealthySources: number; // >= 10 hits
}

interface UniqueSourcesCardProps {
  data: UniqueSourcesData;
  isLoading?: boolean;
  mode?: 'perSource' | 'flood';
}

export function UniqueSourcesCard({ data, isLoading = false, mode = 'perSource' }: UniqueSourcesCardProps) {
  const isFlood = mode === 'flood';
  
  if (isLoading) {
    return (
      <Card className="shadow-metric-card h-full min-h-[140px] flex flex-col">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="h-4 w-32 bg-muted animate-pulse rounded" />
          <div className="h-4 w-4 bg-muted animate-pulse rounded" />
        </CardHeader>
        <CardContent className="mt-auto">
          <div className="h-8 w-16 bg-muted animate-pulse rounded mb-2" />
          <div className="space-y-1">
            <div className="h-3 w-24 bg-muted animate-pulse rounded" />
            <div className="h-3 w-28 bg-muted animate-pulse rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-metric-card bg-dashboard-metric-card-bg h-full min-h-[140px] flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground truncate">
          Unique Sources
        </CardTitle>
        <Users className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="mt-auto">
        <div className="text-2xl font-bold text-foreground mb-2">
          {data.totalUnique.toLocaleString()}
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1">
              <TrendingUp className="h-3 w-3 text-success" />
              <span className="text-muted-foreground">
                {isFlood ? 'Low activity' : 'Healthy'}
              </span>
            </div>
            <span className="font-medium text-success">
              {data.healthySources}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1">
              <TrendingDown className="h-3 w-3 text-destructive" />
              <span className="text-muted-foreground">
                {isFlood ? 'High activity' : 'Unhealthy'}
              </span>
            </div>
            <span className="font-medium text-destructive">
              {data.unhealthySources}
            </span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-2 leading-tight whitespace-normal break-words">
          {isFlood 
            ? 'Sources by flood activity (≥10 threshold)'
            : 'Sources by health status (≥10 threshold)'
          }
        </p>
      </CardContent>
    </Card>
  );
}
