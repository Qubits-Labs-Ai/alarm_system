/**
 * ActualCalcPage - PVCI Actual Calculation Mode
 * Displays alarm lifecycle KPIs: response times, stale/chattering, ISA compliance
 */

import { useState, useEffect } from 'react';
import { fetchPvciActualCalcOverall } from '@/api/actualCalc';
import { ActualCalcOverallResponse } from '@/types/actualCalc';
import { ActualCalcKPICards } from '@/components/dashboard/ActualCalcKPICards';
import { ActualCalcTree } from '@/components/dashboard/ActualCalcTree';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';

export function ActualCalcPage() {
  const [data, setData] = useState<ActualCalcOverallResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetchPvciActualCalcOverall({
        stale_min: 60,
        chatter_min: 10,
        include_per_source: false,
        include_cycles: false,
      });
      
      setData(response);
    } catch (err) {
      console.error('Failed to load actual-calc data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  };

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Error Loading Data
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{error}</p>
            <p className="text-xs text-muted-foreground mt-2">
              The cache may not be generated yet. Run the regeneration endpoint or check backend logs.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Actual Calculation Mode</h1>
        <p className="text-muted-foreground mt-2">
          Alarm lifecycle KPIs: response times, stale/chattering detection, ISA-18.2 compliance
        </p>
        {data && (
          <p className="text-xs text-muted-foreground mt-1">
            Generated: {new Date(data.generated_at).toLocaleString()} | 
            Stale: {data.params.stale_min}min | Chatter: {data.params.chatter_min}min
            {data.sample_range?.start && data.sample_range?.end && (
              <> | Data: {new Date(data.sample_range.start).toLocaleDateString()} - {new Date(data.sample_range.end).toLocaleDateString()}</>
            )}
          </p>
        )}
      </div>

      {/* Tree view at top */}
      {data && !isLoading && (
        <ActualCalcTree data={data} />
      )}

      {/* KPI Cards */}
      {isLoading || !data ? (
        <ActualCalcKPICards 
          kpis={{
            avg_ack_delay_min: 0,
            avg_ok_delay_min: 0,
            completion_rate_pct: 0,
            avg_alarms_per_day: 0,
            avg_alarms_per_hour: 0,
            avg_alarms_per_10min: 0,
            days_over_288_alarms_pct: 0,
          }}
          counts={{
            total_sources: 0,
            total_alarms: 0,
            total_stale: 0,
            total_standing: 0,
            total_instrument_failure: 0,
            total_chattering: 0,
            total_cycles: 0,
          }}
          isLoading={true}
        />
      ) : (
        <ActualCalcKPICards 
          kpis={data.overall}
          counts={data.counts}
          isLoading={false}
        />
      )}

      {/* Summary Card */}
      {data && !isLoading && (
        <Card>
          <CardHeader>
            <CardTitle>Summary Statistics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-7 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Total Sources</p>
                <p className="text-lg font-semibold">{data.counts.total_sources.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Total Alarms</p>
                <p className="text-lg font-semibold">{data.counts.total_alarms.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Standing</p>
                <p className="text-lg font-semibold">{(data.counts.total_standing || 0).toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">
                  {((((data.counts.total_standing || 0)) / data.counts.total_alarms) * 100).toFixed(1)}%
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Stale</p>
                <p className="text-lg font-semibold">{data.counts.total_stale.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">
                  {((data.counts.total_stale / data.counts.total_alarms) * 100).toFixed(1)}%
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Chattering</p>
                <p className="text-lg font-semibold">{data.counts.total_chattering.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">
                  {((data.counts.total_chattering / data.counts.total_alarms) * 100).toFixed(1)}%
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Cycles</p>
                <p className="text-lg font-semibold">{data.counts.total_cycles.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">
                  {data.overall.completion_rate_pct.toFixed(1)}% complete
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
