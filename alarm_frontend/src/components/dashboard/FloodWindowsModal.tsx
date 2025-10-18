/**
 * FloodWindowsModal - Display detailed flood windows with sources
 * Shows color-coded list of flood windows with expandable source details
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
import { Search, Calendar, ChevronDown, ChevronRight, TrendingUp } from 'lucide-react';

interface FloodWindow {
  id: string;
  start: string;
  end: string;
  source_count: number;
  flood_count: number;
  rate_per_min: number | null;
  sources_involved: Record<string, number>;
  top_sources: Array<{ source: string; count: number }>;
}

interface FloodWindowsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: {
    totals: {
      total_windows: number;
      total_flood_count: number;
    };
    windows: FloodWindow[];
    params: {
      window_minutes: number;
      source_threshold: number;
    };
  } | null;
}

export function FloodWindowsModal({ open, onOpenChange, data }: FloodWindowsModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedWindows, setExpandedWindows] = useState<Set<string>>(new Set());

  // Filter windows by search term (searches time range and sources)
  const filteredWindows = useMemo(() => {
    if (!data?.windows) return [];
    const term = searchTerm.toLowerCase().trim();
    if (!term) return data.windows;
    
    return data.windows.filter((w) => {
      const timeStr = `${new Date(w.start).toLocaleString()} ${new Date(w.end).toLocaleString()}`.toLowerCase();
      const sourcesStr = Object.keys(w.sources_involved).join(' ').toLowerCase();
      return timeStr.includes(term) || sourcesStr.includes(term);
    });
  }, [data, searchTerm]);

  // Toggle window expansion
  const toggleWindow = (id: string) => {
    setExpandedWindows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Get color based on severity (flood_count)
  const getSeverityColor = (floodCount: number): string => {
    if (floodCount > 400) return 'oklch(0.58 0.22 25)'; // Critical - Red
    if (floodCount > 200) return 'oklch(0.45 0.10 140)'; // High - Dark green
    if (floodCount > 100) return 'oklch(0.55 0.12 140)'; // Medium - Medium green
    return 'oklch(0.68 0.12 140)'; // Low - Light green
  };

  // Get severity label
  const getSeverityLabel = (floodCount: number): string => {
    if (floodCount > 400) return 'Critical';
    if (floodCount > 200) return 'High';
    if (floodCount > 100) return 'Medium';
    return 'Low';
  };

  // Format time range
  const formatTimeRange = (start: string, end: string): string => {
    const startDate = new Date(start);
    const endDate = new Date(end);
    const duration = Math.round((endDate.getTime() - startDate.getTime()) / 60000); // minutes
    
    return `${startDate.toLocaleString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit' 
    })} → ${endDate.toLocaleString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit' 
    })} (${duration}m)`;
  };

  if (!data) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] p-0 gap-0">
        {/* Header - Fixed */}
        <div className="px-6 pt-6 pb-4 border-b">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
              <Calendar className="h-5 w-5 text-primary" />
              Flood Windows
            </DialogTitle>
            <DialogDescription className="text-sm mt-2">
              Total: <span className="font-semibold text-foreground">{data.totals.total_windows}</span> windows
              {' · '}
              <span className="font-semibold text-foreground">{data.totals.total_flood_count.toLocaleString()}</span> alarms
              {' · '}
              Threshold: {data.params.source_threshold}+ sources
            </DialogDescription>
          </DialogHeader>

          {/* Search */}
          <div className="relative mt-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by time or source..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 h-9"
            />
          </div>
        </div>

        {/* Windows List - Scrollable */}
        <div className="overflow-y-auto max-h-[calc(80vh-220px)] px-6 py-3">
          {filteredWindows.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              <p>No flood windows found matching "{searchTerm}"</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredWindows.map((window) => {
                const color = getSeverityColor(window.flood_count);
                const label = getSeverityLabel(window.flood_count);
                const isExpanded = expandedWindows.has(window.id);
                const Icon = isExpanded ? ChevronDown : ChevronRight;
                
                return (
                  <div
                    key={window.id}
                    className="rounded-lg border-l-2 overflow-hidden"
                    style={{ borderLeftColor: color }}
                  >
                    {/* Window header - clickable */}
                    <div
                      className="flex items-start justify-between p-3 hover:bg-accent/40 transition-colors cursor-pointer"
                      onClick={() => toggleWindow(window.id)}
                    >
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <Icon className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                        
                        <div className="flex-1 min-w-0 space-y-1">
                          {/* Time range */}
                          <div className="text-xs font-medium text-foreground">
                            {formatTimeRange(window.start, window.end)}
                          </div>
                          
                          {/* Stats row */}
                          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <TrendingUp className="h-3 w-3" />
                              {window.rate_per_min?.toFixed(1) || 0}/min
                            </span>
                            <span>·</span>
                            <span>{window.source_count} sources</span>
                          </div>
                        </div>
                      </div>

                      {/* Right side: Badge + Count */}
                      <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                        <span
                          className="text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide"
                          style={{ color, backgroundColor: `${color}15` }}
                        >
                          {label}
                        </span>

                        <div className="text-right min-w-[50px]">
                          <div className="text-base font-bold tabular-nums" style={{ color }}>
                            {window.flood_count}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Expanded source details */}
                    {isExpanded && (
                      <div className="px-3 pb-3 pl-10 space-y-1">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-2">
                          Sources Involved
                        </div>
                        {window.top_sources.map((source, idx) => {
                          const percentage = ((source.count / window.flood_count) * 100).toFixed(1);
                          
                          return (
                            <div
                              key={`${window.id}-${source.source}-${idx}`}
                              className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-accent/30 transition-colors"
                            >
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <div
                                  className="w-1 h-1 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: color }}
                                />
                                <span className="text-xs text-foreground truncate" title={source.source}>
                                  {source.source}
                                </span>
                              </div>

                              <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                                <span className="text-[10px] text-muted-foreground tabular-nums">
                                  {percentage}%
                                </span>
                                <span className="text-xs font-semibold tabular-nums min-w-[40px] text-right" style={{ color }}>
                                  {source.count}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
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
              Showing <span className="font-medium text-foreground">{filteredWindows.length}</span> of {data.windows.length}
            </span>
            <span>
              Total: <span className="font-medium text-foreground">{data.totals.total_flood_count.toLocaleString()}</span> alarms
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
