/**
 * UnhealthyPeriodsModal - Display detailed unhealthy periods per source
 * Shows color-coded list of sources with their unhealthy period counts
 */

import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Search, AlertTriangle } from 'lucide-react';

interface UnhealthyPeriodsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: {
    total_periods: number;
    per_source: Array<{
      Source: string;
      Unhealthy_Periods: number;
    }>;
    params: {
      unhealthy_threshold: number;
      window_minutes: number;
    };
  } | null;
}

export function UnhealthyPeriodsModal({ open, onOpenChange, data }: UnhealthyPeriodsModalProps) {
  const [searchTerm, setSearchTerm] = useState('');

  // Filter sources by search term
  const filteredSources = useMemo(() => {
    if (!data?.per_source) return [];
    const term = searchTerm.toLowerCase().trim();
    if (!term) return data.per_source;
    return data.per_source.filter((s) =>
      s.Source.toLowerCase().includes(term)
    );
  }, [data, searchTerm]);

  // Get color based on severity (unhealthy periods count)
  const getSeverityColor = (periods: number): string => {
    if (periods > 80) return 'oklch(0.58 0.22 25)'; // Red
    if (periods > 50) return 'oklch(0.45 0.10 140)'; // Dark green
    if (periods > 20) return 'oklch(0.55 0.12 140)'; // Medium green
    return 'oklch(0.68 0.12 140)'; // Light green
  };

  // Get severity label
  const getSeverityLabel = (periods: number): string => {
    if (periods > 80) return 'Critical';
    if (periods > 50) return 'High';
    if (periods > 20) return 'Medium';
    return 'Low';
  };

  if (!data) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] p-0 gap-0">
        {/* Header - Fixed */}
        <div className="px-6 pt-6 pb-4 border-b">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
              <AlertTriangle className="h-5 w-5 text-primary" />
              Unhealthy Periods
            </DialogTitle>
            <DialogDescription className="text-sm mt-2">
              Total: <span className="font-semibold text-foreground">{data.total_periods.toLocaleString()}</span> periods
              {' · '}
              Threshold: {data.params.unhealthy_threshold} activations/{data.params.window_minutes}min
            </DialogDescription>
          </DialogHeader>

          {/* Search */}
          <div className="relative mt-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search sources..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 h-9"
            />
          </div>
        </div>

        {/* Sources List - Scrollable */}
        <div className="overflow-y-auto max-h-[calc(80vh-220px)] px-6 py-3">
          {filteredSources.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              <p>No sources found matching "{searchTerm}"</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {filteredSources.map((source, idx) => {
                const color = getSeverityColor(source.Unhealthy_Periods);
                const label = getSeverityLabel(source.Unhealthy_Periods);
                
                return (
                  <div
                    key={`${source.Source}-${idx}`}
                    className="group flex items-center justify-between py-2.5 px-3 rounded-md hover:bg-accent/40 transition-colors cursor-default border-l-2"
                    style={{ borderLeftColor: color }}
                  >
                    {/* Source name */}
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <div
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-sm font-medium text-foreground truncate" title={source.Source}>
                        {source.Source}
                      </span>
                    </div>

                    {/* Right side: Badge + Count */}
                    <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                      {/* Severity badge */}
                      <span
                        className="text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide"
                        style={{ color, backgroundColor: `${color}15` }}
                      >
                        {label}
                      </span>

                      {/* Count */}
                      <div className="text-right min-w-[50px]">
                        <div className="text-base font-bold tabular-nums" style={{ color }}>
                          {source.Unhealthy_Periods}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer - Fixed */}
        <div className="px-6 py-3 border-t bg-muted/30">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Showing <span className="font-medium text-foreground">{filteredSources.length}</span> of {data.per_source.length}
            </span>
            <span>
              Total: <span className="font-medium text-foreground">{data.total_periods.toLocaleString()}</span> periods
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
