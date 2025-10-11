import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, Clock, AlertTriangle, Filter, Download, Zap } from 'lucide-react';
import { useInsightModal } from '@/components/insights/useInsightModal';
import { InsightButton } from '@/components/insights/InsightButton';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  BarChart,
  Bar
} from 'recharts';
import { CHART_GREEN_DARK, CHART_GREEN_LIGHT, CHART_GREEN_MEDIUM, CHART_GREEN_PALE, priorityToGreen } from '@/theme/chartColors';
import { Switch } from '@/components/ui/switch';
import { fetchUnhealthySources as fetchAPI, fetchPvciIsaFloodSummaryEnhanced, fetchPvciWindowSourceDetails } from '@/api/plantHealth';

interface UnhealthyRecord {
  event_time: string;
  bin_end: string;
  source: string;
  hits: number;
  threshold: number;
  over_by: number;
  rate_per_min: number;
  location_tag?: string;
  condition?: string;
  action?: string;
  priority?: string;
  description?: string;
  value?: number;
  units?: string;
  flood_count?: number;
}

interface UnhealthySourcesData {
  count: number;
  records: UnhealthyRecord[];
}

interface SelectedWindowRef {
  id: string;
  start: string;
  end: string;
  label?: string;
}

interface UnhealthySourcesChartProps {
  className?: string;
  plantId?: string;
  // Global control: when provided, component hides its own toggle and uses this value
  includeSystem?: boolean;
  // New: render plant-wide ISA mode (PVC-I only)
  mode?: 'perSource' | 'flood';
  // Optional selected 10-min window for flood mode (aligns with TopFloodWindows/UnhealthyBarChart)
  selectedWindow?: SelectedWindowRef | null;
  // Optional applied global date/time range (ISA-18 flood mode)
  appliedRange?: { startTime?: string; endTime?: string };
}

const UnhealthySourcesChart: React.FC<UnhealthySourcesChartProps> = ({ className, plantId = 'pvcI', includeSystem: includeSystemProp, mode = 'perSource', selectedWindow = null, appliedRange }) => {
  const [data, setData] = useState<UnhealthySourcesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartType, setChartType] = useState<'timeline' | 'bar'>('timeline');
  const [selectedPriority, setSelectedPriority] = useState<string>('all');
  const [timeRange, setTimeRange] = useState<string>('all');
  const [orientation, setOrientation] = useState<'horizontal' | 'vertical'>('horizontal'); // horizontal: X=time, Y=source; vertical: X=source, Y=time
  const [selectedMonth, setSelectedMonth] = useState<string>('all'); // default All; supports 'all' or 'YYYY-MM'
  const [availableMonths, setAvailableMonths] = useState<Array<{ value: string; label: string; start: Date; end: Date }>>([]);
  const [windowMode, setWindowMode] = useState<'recent' | 'peak'>('peak');
  // Optional explicit domain for X axis (ms since epoch). When null, use dataMin/dataMax
  const [xDomain, setXDomain] = useState<[number, number] | null>(null);
  const { onOpen: openInsightModal } = useInsightModal();
  const plantLabel = plantId === 'pvcI' ? 'PVC-I' : (plantId === 'pvcII' ? 'PVC-II' : plantId.toUpperCase());
  // Guard to apply only latest fetch results (prevents stale clears)
  const reqRef = useRef(0);

  // System/meta classification and toggle
  const isMetaSource = (name: string) => {
    const s = String(name || '').trim().toUpperCase();
    if (!s) return false;
    return s === 'REPORT' || s.startsWith('$') || s.startsWith('ACTIVITY') || s.startsWith('SYS_') || s.startsWith('SYSTEM');
  };
  const [includeSystemLocal, setIncludeSystemLocal] = useState(true);
  const includeSystem = includeSystemProp ?? includeSystemLocal;

  const handleInsightClick = () => {
    // useInsightModal.onOpen expects (data, title)
    const title = `Unhealthy Sources Timeline — ${plantLabel} — ${selectedMonth} — ${timeRange} — ${windowMode}`;
    openInsightModal(filteredRecords, title);
  };

  const isExternallyRanged = Boolean(appliedRange?.startTime || appliedRange?.endTime);

  useEffect(() => {
    loadData();
  }, [timeRange, selectedMonth, windowMode, plantId, availableMonths.length, mode, selectedWindow?.id, selectedWindow?.start, selectedWindow?.end, appliedRange?.startTime, appliedRange?.endTime]);

  // Load months list once on mount (derive from full dataset)
  useEffect(() => {
    loadAvailableMonths();
  }, [plantId, mode]);

  // When user selects All months, default the timeRange to 'all' so everything shows
  useEffect(() => {
    if (selectedMonth === 'all' && timeRange !== 'all') {
      setTimeRange('all');
    }
  }, [selectedMonth]);

  const getWindowMs = (tr: string) => {
    switch (tr) {
      case 'all': return null as unknown as number; // special: means unbounded within scope
      case '1h': return 1 * 60 * 60 * 1000;
      case '6h': return 6 * 60 * 60 * 1000;
      case '24h': return 24 * 60 * 60 * 1000;
      case '7d': return 7 * 24 * 60 * 60 * 1000;
      default: return 24 * 60 * 60 * 1000;
    }
  };

  const loadAvailableMonths = async () => {
    try {
      if (mode === 'flood' && plantId === 'pvcI') {
        const res: any = await fetchPvciIsaFloodSummaryEnhanced({ include_records: true, include_windows: true, include_alarm_details: false, include_enhanced: true, top_n: 10, max_windows: 180, timeout_ms: 12000 });
        const monthMap = new Map<string, { start: Date; end: Date }>();
        // Prefer by_day for robust month coverage
        const byDay: any[] = Array.isArray(res?.by_day) ? res.by_day : [];
        if (byDay.length > 0) {
          for (const row of byDay) {
            const ds = row?.date ? `${row.date}T00:00:00Z` : undefined;
            if (!ds) continue;
            const d = new Date(ds);
            const value = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
            if (!monthMap.has(value)) {
              const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
              const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 0, 0, 0, 0));
              monthMap.set(value, { start, end });
            }
          }
        } else {
          // Fallback to records/windows if by_day missing
          const list: any[] = Array.isArray(res?.records) ? res.records : [];
          for (const r of list) {
            const ds = r?.peak_window_start || r?.windows?.[0]?.window_start || r?.start;
            if (!ds) continue;
            const d = new Date(ds);
            const value = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
            if (!monthMap.has(value)) {
              const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
              const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 0, 0, 0, 0));
              monthMap.set(value, { start, end });
            }
          }
        }
        const items = Array.from(monthMap.entries()).map(([value, range]) => ({
          value,
          label: new Date(`${value}-01T00:00:00Z`).toLocaleString(undefined, { month: 'short', year: 'numeric' }),
          start: range.start,
          end: range.end,
        })).sort((a, b) => a.start.getTime() - b.start.getTime());
        setAvailableMonths(items);
      } else {
        const res = await fetchAPI(undefined, undefined, '10T', 10, plantId); // no filters → full historical dataset
        const records: any[] = res?.records || [];
        const monthMap = new Map<string, { start: Date; end: Date }>();
        for (const r of records) {
          const ds = (r as any).peak_window_start || (r as any).event_time || (r as any).bin_start || (r as any).bin_end;
          if (!ds) continue;
          const d = new Date(ds);
          const value = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
          if (!monthMap.has(value)) {
            const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
            const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 0, 0, 0, 0));
            monthMap.set(value, { start, end });
          }
        }
        const items = Array.from(monthMap.entries()).map(([value, range]) => ({
          value,
          label: new Date(`${value}-01T00:00:00Z`).toLocaleString(undefined, { month: 'short', year: 'numeric' }),
          start: range.start,
          end: range.end,
        })).sort((a, b) => a.start.getTime() - b.start.getTime());
        setAvailableMonths(items);
      }
    } catch (e) {
      console.warn('Failed to load available months', e);
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const myReq = ++reqRef.current;

      console.log(`[UnhealthySourcesChart] Loading data - mode: ${mode}, plantId: ${plantId}, appliedRange:`, appliedRange);
      console.log(`[UnhealthySourcesChart] selectedWindow:`, selectedWindow);
      console.log(`[UnhealthySourcesChart] selectedMonth: ${selectedMonth}, timeRange: ${timeRange}, windowMode: ${windowMode}`);

      const windowMs = getWindowMs(timeRange);

      // Flood mode (PVC-I ISA 18.2 plant-wide)
      if (mode === 'flood' && plantId === 'pvcI') {
        // If a specific window is selected, use precise per-window details
        if (selectedWindow?.start && selectedWindow?.end) {
          const details: any = await fetchPvciWindowSourceDetails(selectedWindow.start, selectedWindow.end, 500);
          const psd: any[] = Array.isArray(details?.per_source_detailed) ? details.per_source_detailed : [];
          let recs = psd.map(d => ({
            event_time: selectedWindow.start,
            bin_end: selectedWindow.end,
            source: String(d.source || 'Unknown'),
            hits: Number(d.count || 0),
            threshold: 10,
            over_by: Math.max(0, Number(d.count || 0) - 10),
            rate_per_min: Number(d.count || 0) / 10,
            location_tag: d.location_tag,
            condition: d.condition || 'Not Provided',
            flood_count: Number(d.count || 0),
            priority: (Number(d.count || 0) >= 25 ? 'High' : Number(d.count || 0) >= 15 ? 'Medium' : 'Low'),
            peak_window_start: selectedWindow.start,
            peak_window_end: selectedWindow.end,
          }));
          // IncludeSystem filter
          const isMetaSourceName = (name: string) => {
            const s = String(name || '').trim().toUpperCase();
            return s === 'REPORT' || s.startsWith('$') || s.startsWith('ACTIVITY') || s.startsWith('SYS_') || s.startsWith('SYSTEM');
          };
          if (!includeSystem) recs = recs.filter(r => !isMetaSourceName(r.source));
          // Note: Do NOT enforce per-source >=10 here; plant-wide floods can have many sources <10.
          const result = { count: recs.length, records: recs };
          if (myReq === reqRef.current) setData(result);
          // Set domain to the selected window
          setXDomain([new Date(selectedWindow.start).getTime(), new Date(selectedWindow.end).getTime()]);
          return;
        }

        // No selected window: use ISA summary to plot top sources at each flood window
        // Handle Month/Time Range anchoring similar to per-source
        const deriveAndFetch = async (startIso?: string, endIso?: string) => {
          // If we are fetching a whole month (timeRange === 'all'), allow more windows so later dates appear
          const maxWindows = (startIso && endIso && timeRange === 'all') ? 1000 : 60;
          
          console.log(`[UnhealthySourcesChart] Fetching ISA flood summary for range: ${startIso} → ${endIso}`);
          
          const isRangeFetch = Boolean(startIso && endIso);
          const res: any = await fetchPvciIsaFloodSummaryEnhanced({ 
            include_records: true, 
            // For applied ranges, skip windows/details to keep it fast; we synthesize fallback points
            include_windows: isRangeFetch ? false : true, 
            include_alarm_details: isRangeFetch ? false : true, 
            include_enhanced: true,
            top_n: 10, 
            max_windows: isRangeFetch ? 0 : maxWindows, 
            start_time: startIso, 
            end_time: endIso, 
            timeout_ms: isRangeFetch ? 20000 : 12000 
          });
          
          console.log(`[UnhealthySourcesChart] ISA flood summary response:`, res);
          
          const list: any[] = Array.isArray(res?.records) ? res.records : [];
          console.log(`[UnhealthySourcesChart] Processing ${list.length} flood records`);
          
          const points: any[] = [];
          for (const r of list) {
            const pws = r?.peak_window_start || r?.windows?.[0]?.window_start;
            const pwe = r?.peak_window_end || r?.windows?.[0]?.window_end;
            
            if (!pws || !pwe) {
              console.log(`[UnhealthySourcesChart] Skipping record with missing window times:`, r);
              continue;
            }
            
            // Try multiple shapes for top sources
            const tops: any[] = Array.isArray(r?.peak_window_details?.top_sources)
              ? r.peak_window_details.top_sources
              : (Array.isArray(r?.top_sources) ? r.top_sources : []);
              
            console.log(`[UnhealthySourcesChart] Found ${tops.length} top sources for window ${pws} → ${pwe}`);
            
            for (const t of tops) {
              const c = Number(t?.count || 0);
              if (!c) continue; // Skip only if zero or missing
              points.push({
                event_time: pws,
                bin_end: pwe,
                source: String(t?.source || 'Unknown'),
                hits: c,
                threshold: 10,
                over_by: Math.max(0, c - 10),
                rate_per_min: c / 10,
                location_tag: undefined,
                condition: undefined,
                flood_count: c,
                priority: (c >= 25 ? 'High' : c >= 15 ? 'Medium' : 'Low'),
                peak_window_start: pws,
                peak_window_end: pwe,
              });
            }
          }

          // Fallback: if we have ISA flood records but NO per-source details were produced,
          // synthesize plant-wide points so the timeline is not empty.
          if (points.length === 0 && list.length > 0) {
            console.log('[UnhealthySourcesChart] No per-source details; falling back to plant-wide peak points');
            for (const r of list) {
              const pws = r?.peak_window_start || r?.windows?.[0]?.window_start;
              const pwe = r?.peak_window_end || r?.windows?.[0]?.window_end;
              const pc = Number(r?.peak_10min_count || r?.windows?.[0]?.count || 0);
              if (!pws || !pwe || !pc) continue;
              points.push({
                event_time: pws,
                bin_end: pwe,
                source: 'Plant‑Wide',
                hits: pc,
                threshold: 10,
                over_by: Math.max(0, pc - 10),
                rate_per_min: pc / 10,
                location_tag: undefined,
                condition: undefined,
                flood_count: pc,
                priority: (pc >= 25 ? 'High' : pc >= 15 ? 'Medium' : 'Low'),
                peak_window_start: pws,
                peak_window_end: pwe,
              });
            }
            console.log(`[UnhealthySourcesChart] Fallback synthesized ${points.length} plant-wide points`);
          }
          
          console.log(`[UnhealthySourcesChart] Generated ${points.length} data points before filtering`);
          
          // IncludeSystem and unhealthy-only
          const isMetaSourceName = (name: string) => {
            const s = String(name || '').trim().toUpperCase();
            return s === 'REPORT' || s.startsWith('$') || s.startsWith('ACTIVITY') || s.startsWith('SYS_') || s.startsWith('SYSTEM');
          };
          
          let filtered = includeSystem ? points : points.filter(p => !isMetaSourceName(p.source));
          console.log(`[UnhealthySourcesChart] After includeSystem filter: ${filtered.length} points (no per-source >=10 filter in flood mode)`);
          
          // Guard: ensure we only keep points within requested time range when provided
          if (startIso && endIso) {
            const startMs = new Date(startIso).getTime();
            const endMs = new Date(endIso).getTime();
            const beforeTimeFilter = filtered.length;
            filtered = filtered.filter(p => {
              const ts = new Date(p.peak_window_start || p.event_time || p.bin_end || p.peak_window_end).getTime();
              return ts >= startMs && ts <= endMs;
            });
            console.log(`[UnhealthySourcesChart] After time range filter (${startIso} → ${endIso}): ${filtered.length} points (was ${beforeTimeFilter})`);
          }
          
          // When a bounded range is provided, set explicit domain
          if (startIso && endIso) {
            setXDomain([new Date(startIso).getTime(), new Date(endIso).getTime()]);
            console.log(`[UnhealthySourcesChart] Set X domain: ${startIso} → ${endIso}`);
          } else {
            setXDomain(null);
            console.log(`[UnhealthySourcesChart] Cleared X domain (auto-scale)`);
          }
          
          // If applied range yields no plant-wide ISA points, fall back to per-source unhealthy events
          if ((startIso && endIso) && filtered.length === 0) {
            try {
              console.log('[UnhealthySourcesChart] No ISA points in range; falling back to per-source unhealthy events');
              const alt = await fetchAPI(startIso, endIso, '10T', 10, plantId);
              const recs: any[] = Array.isArray(alt?.records) ? alt.records : [];
              let altPoints = recs.map((r: any) => {
                const cnt = Number((r?.flood_count ?? r?.hits) || 0);
                const pws2 = r?.peak_window_start || r?.event_time;
                const pwe2 = r?.peak_window_end || r?.bin_end;
                return {
                  event_time: pws2,
                  bin_end: pwe2,
                  source: String(r?.source || 'Unknown'),
                  hits: cnt,
                  threshold: 10,
                  over_by: Math.max(0, cnt - 10),
                  rate_per_min: cnt / 10,
                  location_tag: (r as any)?.location_tag,
                  condition: (r as any)?.condition,
                  flood_count: cnt,
                  priority: (cnt >= 25 ? 'High' : cnt >= 15 ? 'Medium' : 'Low'),
                  peak_window_start: pws2,
                  peak_window_end: pwe2,
                } as any;
              });
              const baseAlt = includeSystem ? altPoints : altPoints.filter(p => !isMetaSourceName(p.source));
              console.log(`[UnhealthySourcesChart] Per-source fallback yielded ${baseAlt.length} points`);
              if (baseAlt.length > 0) {
                return { count: baseAlt.length, records: baseAlt };
              }
            } catch (e) {
              console.warn('[UnhealthySourcesChart] Per-source fallback failed', e);
            }
          }
          
          const result = { count: filtered.length, records: filtered };
          console.log(`[UnhealthySourcesChart] Final result:`, result);
          return result;
        };

        let result: any = null;
        // If a global applied range is present, use it directly
        if (appliedRange?.startTime || appliedRange?.endTime) {
          console.log(`[UnhealthySourcesChart] Using applied range:`, appliedRange);
          result = await deriveAndFetch(appliedRange?.startTime, appliedRange?.endTime);
          console.log(`[UnhealthySourcesChart] Applied range result:`, result);
          if (myReq === reqRef.current) {
            setData(result);
            console.log(`[UnhealthySourcesChart] Set data for applied range, count: ${result?.count || 0}`);
          }
          return;
        }
        if (selectedMonth === 'all') {
          if (timeRange === 'all') {
            result = await deriveAndFetch(undefined, undefined);
          } else {
            // Determine anchor within full dataset
            const full = await fetchPvciIsaFloodSummary({ include_records: true, include_windows: true, include_alarm_details: false, top_n: 10, max_windows: 120, timeout_ms: 12000 });
            const list: any[] = Array.isArray(full?.records) ? full.records : [];
            if (!list || list.length === 0) {
              // Nothing in full dataset (unlikely) — clear results and reset domain
              const empty = { count: 0, records: [] as any[] };
              if (myReq === reqRef.current) setData(empty);
              setXDomain(null);
              return;
            }
            const getTs = (r: any) => new Date(r?.peak_window_start || r?.windows?.[0]?.window_start || r?.start || 0).getTime();
            const getPeak = (r: any) => Number(r?.peak_10min_count || 0);
            const minTs = list.reduce((m, r) => Math.min(m, getTs(r) || Infinity), Infinity);
            const maxTs = list.reduce((m, r) => Math.max(m, getTs(r) || 0), 0);
            let anchorTs: number;
            if (windowMode === 'peak') {
              let best = list[0];
              for (const rec of list) { if (getPeak(rec) > getPeak(best)) best = rec; }
              anchorTs = getTs(best) || maxTs;
            } else {
              anchorTs = list.reduce((m, r) => Math.max(m, getTs(r)), 0) || maxTs;
            }
            const datasetStart = new Date(minTs === Infinity ? maxTs - windowMs : minTs);
            const datasetEnd = new Date(maxTs || Date.now());
            const anchorEnd = new Date(Math.min(anchorTs, datasetEnd.getTime()));
            const anchorStart = new Date(Math.max(datasetStart.getTime(), anchorEnd.getTime() - windowMs));
            result = await deriveAndFetch(anchorStart.toISOString(), anchorEnd.toISOString());
          }
        } else {
          const month = availableMonths.find(m => m.value === selectedMonth);
          const monthStart = month?.start || new Date(`${selectedMonth}-01T00:00:00Z`);
          const monthEnd = month?.end || new Date(new Date(`${selectedMonth}-01T00:00:00Z`).getTime() + 32 * 24 * 60 * 60 * 1000);
          if (timeRange === 'all') {
            result = await deriveAndFetch(monthStart.toISOString(), monthEnd.toISOString());
            // Full month range domain for context
            setXDomain([monthStart.getTime(), monthEnd.getTime()]);
          } else {
            const full = await fetchPvciIsaFloodSummary({ include_records: true, include_windows: true, include_alarm_details: false, top_n: 10, max_windows: 120, start_time: monthStart.toISOString(), end_time: monthEnd.toISOString(), timeout_ms: 12000 });
            const list: any[] = Array.isArray(full?.records) ? full.records : [];
            if (!list || list.length === 0) {
              // No plant-wide floods in this month; clear points and clamp domain to the month
              const empty = { count: 0, records: [] as any[] };
              if (myReq === reqRef.current) setData(empty);
              setXDomain([monthStart.getTime(), monthEnd.getTime()]);
              return;
            }
            const getTs = (r: any) => new Date(r?.peak_window_start || r?.windows?.[0]?.window_start || r?.start || 0).getTime();
            const getPeak = (r: any) => Number(r?.peak_10min_count || 0);
            let anchorTs: number;
            if (windowMode === 'peak') {
              let best = list[0];
              for (const rec of list) { if (getPeak(rec) > getPeak(best)) best = rec; }
              anchorTs = getTs(best) || monthEnd.getTime();
            } else {
              anchorTs = list.reduce((m, r) => Math.max(m, getTs(r)), 0) || monthEnd.getTime();
            }
            let anchorEnd = new Date(Math.min(anchorTs, monthEnd.getTime()));
            let anchorStart = new Date(Math.max(monthStart.getTime(), anchorEnd.getTime() - windowMs));
            if (anchorStart.getTime() + windowMs > monthEnd.getTime()) {
              anchorStart = new Date(Math.max(monthStart.getTime(), monthEnd.getTime() - windowMs));
              anchorEnd = new Date(Math.min(monthEnd.getTime(), anchorStart.getTime() + windowMs));
            }
            result = await deriveAndFetch(anchorStart.toISOString(), anchorEnd.toISOString());
          }
        }
        if (myReq === reqRef.current) setData(result);
        // Done flood mode
        return;
      }

      // Per-source (existing behavior)
      let result: any = null;
      if (selectedMonth === 'all') {
        if (timeRange === 'all') {
          console.log('Fetching entire dataset (All months, full range)');
          result = await fetchAPI(undefined, undefined, '10T', 10, plantId);
          if (myReq === reqRef.current) setData(result);
          if (result && result.count === 0) console.log('No unhealthy sources found in entire dataset');
          setXDomain(null);
          return;
        }
        console.log('Fetching full dataset (All months, unbounded) to derive window');
        const fullResult = await fetchAPI(undefined, undefined, '10T', 10, plantId);
        if (!fullResult || fullResult.count === 0) {
          result = fullResult;
          if (myReq === reqRef.current) setData(result);
          if (result && result.count === 0) console.log('No unhealthy sources found in entire dataset');
          return;
        }

        const records: any[] = fullResult.records || [];
        const getTs = (r: any) => {
          const ds = r.peak_window_start || r.event_time || r.bin_start || r.bin_end;
          return ds ? new Date(ds).getTime() : 0;
        };
        const getFlood = (r: any) => (r.flood_count ?? r.hits ?? 0) as number;
        const minTs = records.reduce((min, r) => Math.min(min, getTs(r) || Infinity), Infinity);
        const maxTs = records.reduce((max, r) => Math.max(max, getTs(r) || 0), 0);

        let anchorTs: number;
        if (windowMode === 'peak') {
          let best = records[0];
          for (const rec of records) {
            if (getFlood(rec) > getFlood(best)) best = rec;
          }
          anchorTs = getTs(best) || maxTs;
        } else {
          anchorTs = records.reduce((max, r) => Math.max(max, getTs(r)), 0) || maxTs;
        }

        const datasetStart = new Date(minTs === Infinity ? maxTs - windowMs : minTs);
        const datasetEnd = new Date(maxTs || Date.now());
        let anchorEnd = new Date(Math.min(anchorTs, datasetEnd.getTime()));
        let anchorStart = new Date(Math.max(datasetStart.getTime(), anchorEnd.getTime() - windowMs));

        console.log(`Derived global window (${windowMode}) ${anchorStart.toISOString()} → ${anchorEnd.toISOString()}`);
        result = await fetchAPI(anchorStart.toISOString(), anchorEnd.toISOString(), '10T', 10, plantId);
        setXDomain([anchorStart.getTime(), anchorEnd.getTime()]);
      } else {
        const month = availableMonths.find(m => m.value === selectedMonth);
        const monthStart = month?.start || new Date(`${selectedMonth}-01T00:00:00Z`);
        const monthEnd = month?.end || new Date(new Date(`${selectedMonth}-01T00:00:00Z`).getTime() + 32 * 24 * 60 * 60 * 1000);

        if (timeRange === 'all') {
          console.log(`Fetching full month ${selectedMonth} dataset`);
          result = await fetchAPI(monthStart.toISOString(), monthEnd.toISOString(), '10T', 10, plantId);
          setData(result);
          setXDomain([monthStart.getTime(), monthEnd.getTime()]);
          return;
        }

        console.log(`Fetching month dataset ${selectedMonth}: ${monthStart.toISOString()} → ${monthEnd.toISOString()}`);
        const monthResult = await fetchAPI(monthStart.toISOString(), monthEnd.toISOString(), '10T', 10, plantId);

        if (!monthResult || monthResult.count === 0) {
          result = monthResult;
          setData(result);
          if (result && result.count === 0) {
            console.log('No unhealthy sources found for selected month');
          }
          return; 
        }

        const records: any[] = monthResult.records || [];
        const getTs = (r: any) => {
          const ds = r.peak_window_start || r.event_time || r.bin_start || r.bin_end;
          return ds ? new Date(ds).getTime() : 0;
        };
        const getFlood = (r: any) => (r.flood_count ?? r.hits ?? 0) as number;

        let anchorTs: number;
        if (windowMode === 'peak') {
          let best = records[0];
          for (const rec of records) {
            if (getFlood(rec) > getFlood(best)) best = rec;
          }
          anchorTs = getTs(best) || monthEnd.getTime();
        } else {
          anchorTs = records.reduce((max, r) => Math.max(max, getTs(r)), 0) || monthEnd.getTime();
        }

        let anchorEnd = new Date(Math.min(anchorTs, monthEnd.getTime()));
        let anchorStart = new Date(Math.max(monthStart.getTime(), anchorEnd.getTime() - windowMs));
        if (anchorStart.getTime() + windowMs > monthEnd.getTime()) {
          anchorStart = new Date(Math.max(monthStart.getTime(), monthEnd.getTime() - windowMs));
          anchorEnd = new Date(Math.min(monthEnd.getTime(), anchorStart.getTime() + windowMs));
        }

        console.log(`Derived window (${windowMode}) ${anchorStart.toISOString()} → ${anchorEnd.toISOString()}`);
        result = await fetchAPI(anchorStart.toISOString(), anchorEnd.toISOString(), '10T', 10, plantId);
        setXDomain([anchorStart.getTime(), anchorEnd.getTime()]);
      }
      setData(result);

      if (result && result.count === 0) {
        console.log('No unhealthy sources found in the selected time range');
      } else if (result && result.count > 0) {
        console.log(`Found ${result.count} unhealthy sources`);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch unhealthy sources data';
      setError(errorMessage);
      console.error('Error fetching unhealthy sources:', err);
      if (errorMessage.includes('404')) {
        setError('Unhealthy sources endpoint not found. Please check if the backend server is running.');
      } else if (errorMessage.includes('500')) {
        setError('Server error while processing unhealthy sources. Please try again later.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Filter data based on selected priority (memoized)
  const filteredRecords = React.useMemo(() => {
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const recs = (data?.records || [])
      .filter(record => selectedPriority === 'all' || record.priority === selectedPriority)
      .filter(record => includeSystem || !isMetaSource(record.source));
    const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
    console.log('Perf • Timeline filter', `${Math.round(elapsed)}ms`, `records:${recs.length}`);
    return recs;
  }, [data, selectedPriority, includeSystem]);

  // Prepare data for timeline scatter chart (memoized, efficient)
  const timelineData = React.useMemo(() => {
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    // Build stable index map of sources once
    const srcIndex = new Map<string, number>();
    let idxCounter = 0;
    for (const r of filteredRecords) {
      const s = r.source;
      if (!srcIndex.has(s)) srcIndex.set(s, idxCounter++);
    }
    const arr = filteredRecords.map((record, index) => {
      const start = (record as any).peak_window_start || (record as any).event_time;
      const end = (record as any).peak_window_end || (record as any).bin_end;
      const flood = (record as any).flood_count ?? (record as any).hits ?? 0;
      return {
        x: new Date(start).getTime(),
        y: record.source,
        flood_count: flood,
        hits: (record as any).hits,
        over_by: (record as any).over_by,
        rate_per_min: Math.round((Number(flood) / 10) * 10) / 10,
        priority: record.priority || 'Medium',
        description: record.description || 'No description',
        location_tag: record.location_tag || 'Unknown',
        condition: record.condition || 'Unknown',
        peak_window_start: start,
        peak_window_end: end,
        sourceIndex: srcIndex.get(record.source) ?? 0,
        id: index,
      };
    });
    const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
    console.log('Perf • Timeline map', `${Math.round(elapsed)}ms`, `points:${arr.length}`);
    return arr;
  }, [filteredRecords]);

  // Prepare data for bar chart (sources by total flood count) — memoized
  const sourceHitsData = React.useMemo(() => {
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const map = new Map<string, {source: string, totalFlood: number, incidents: number, maxFlood: number}>();
    for (const record of filteredRecords) {
      const count = (record as any).flood_count ?? (record as any).hits ?? 0;
      const key = record.source;
      const ex = map.get(key);
      if (ex) {
        ex.totalFlood += count;
        ex.incidents += 1;
        ex.maxFlood = Math.max(ex.maxFlood, count);
      } else {
        map.set(key, { source: key, totalFlood: count, incidents: 1, maxFlood: count });
      }
    }
    const arr = Array.from(map.values()).map(item => ({
      ...item,
      avgFlood: Math.round((item.totalFlood / item.incidents) * 10) / 10,
    }))
    .sort((a, b) => b.totalFlood - a.totalFlood)
    .slice(0, 20);
    const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
    console.log('Perf • Timeline bar aggregate', `${Math.round(elapsed)}ms`, `sources:${arr.length}`);
    return arr;
  }, [filteredRecords]);

  // Get unique priorities for filter
  const priorities = ['all', ...new Set(filteredRecords.map(r => r.priority).filter(Boolean))];

  // Color mapping for priorities
  const getPriorityColor = (priority: string) => {
    return priorityToGreen(priority);
  };

  // Custom tooltip for timeline chart
  const TimelineTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-popover text-popover-foreground p-4 border rounded-lg shadow-lg max-w-sm">
          <div className="font-semibold text-foreground mb-2">{data.y}</div>
          <div className="space-y-1 text-sm text-muted-foreground">
            <div>
              <span className="font-medium">Peak Window (Local):</span> {new Date(data.peak_window_start || data.x).toLocaleString()} → {new Date(data.peak_window_end || data.x).toLocaleString()}
            </div>
            <div>
              <span className="font-medium">Peak Window (UTC):</span> {new Date(data.peak_window_start || data.x).toLocaleString(undefined, { timeZone: 'UTC' })} → {new Date(data.peak_window_end || data.x).toLocaleString(undefined, { timeZone: 'UTC' })}
            </div>
            <div><span className="font-medium">Flood Count:</span> {data.flood_count ?? data.hits ?? 0}</div>
            {/* Removed Hits (10-min) and Over by per UX request; retain only Flood Count */}
            {/* Rate per min hidden as requested */}
            <div><span className="font-medium">Priority:</span> 
              <Badge variant="outline" className="ml-1" style={{borderColor: getPriorityColor(data.priority)}}>
                {data.priority}
              </Badge>
            </div>
            <div><span className="font-medium">Location:</span> {data.location_tag}</div>
            <div><span className="font-medium">Condition:</span> {data.condition}</div>
            {data.description !== 'No description' && (
              <div><span className="font-medium">Description:</span> {data.description}</div>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
            <p>Loading unhealthy sources...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show empty state when no data is found
  if (!loading && !error && (!data || data.count === 0 || filteredRecords.length === 0)) {
    return (
      <Card className={className}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                Unhealthy Sources Timeline
              </CardTitle>
              <CardDescription>
                No unhealthy sources found in the selected time range • All systems healthy!
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {!isExternallyRanged && (
                <>
                  {/* Month Selector */}
                  <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                    <SelectTrigger className="w-36">
                      <SelectValue placeholder="Month" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      {availableMonths.map(m => (
                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {/* Window Mode */}
                  <Select value={windowMode} onValueChange={(v) => setWindowMode(v as any)}>
                    <SelectTrigger className="w-36">
                      <SelectValue placeholder="Window" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="recent">Most Recent</SelectItem>
                      <SelectItem value="peak">Peak Activity</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={timeRange} onValueChange={setTimeRange}>
                    <SelectTrigger className="w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1h">1H</SelectItem>
                      <SelectItem value="6h">6H</SelectItem>
                      <SelectItem value="24h">24H</SelectItem>
                      <SelectItem value="7d">7D</SelectItem>
                      <SelectItem value="all">All</SelectItem>
                    </SelectContent>
                  </Select>
                </>
              )}
              <Button variant="outline" size="sm" onClick={loadData}>
                <Clock className="h-4 w-4 mr-1" />
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="bg-accent p-4 rounded-full mb-4">
              <Zap className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">All Systems Healthy!</h3>
            <p className="text-muted-foreground mb-4">
              No sources are exceeding the 10 alarms per 10-minute threshold in the selected time range.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setTimeRange('7d')}>
                Try 7 Days
              </Button>
              <Button variant="outline" onClick={loadData}>
                Refresh Data
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center h-64">
          <div className="text-center text-destructive">
            <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
            <p>{error}</p>
            <Button onClick={loadData} className="mt-2" variant="outline">
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              Unhealthy Sources Timeline
            </CardTitle>
            <CardDescription>
              Sources exceeding 10 alarms per 10-minute window • Frequency: {filteredRecords.length} • Total Flood: {filteredRecords.reduce((sum, r: any) => sum + (r.flood_count ?? r.hits ?? 0), 0)}
              {data && data.count === 0 && (
                <span className="text-success ml-2">• All systems healthy!</span>
              )}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {/* Month Selector */}
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Month" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {availableMonths.map(m => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Window Mode */}
            <Select value={windowMode} onValueChange={(v) => setWindowMode(v as any)}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Window" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Most Recent</SelectItem>
                <SelectItem value="peak">Peak Activity</SelectItem>
              </SelectContent>
            </Select>
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1h">1H</SelectItem>
                <SelectItem value="6h">6H</SelectItem>
                <SelectItem value="24h">24H</SelectItem>
                <SelectItem value="7d">7D</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
                        <InsightButton onClick={handleInsightClick} disabled={loading || filteredRecords.length === 0} />
            <Button variant="outline" size="sm" onClick={loadData}>
              <Clock className="h-4 w-4 mr-1" />
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex items-center gap-4 p-3 bg-accent rounded-lg">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Filters:</span>
            </div>
            <Select value={selectedPriority} onValueChange={setSelectedPriority}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                {priorities.map(priority => (
                  <SelectItem key={priority} value={priority}>
                    {priority === 'all' ? 'All Priorities' : priority}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Include system toggle (hidden when controlled globally) */}
            {includeSystemProp === undefined && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Include system</span>
                <Switch checked={includeSystemLocal} onCheckedChange={setIncludeSystemLocal} />
              </div>
            )}
            {/* Window Mode Tabs (quick toggle) */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Window:</span>
              <Tabs value={windowMode} onValueChange={(v) => setWindowMode(v as any)}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="recent">Most Recent</TabsTrigger>
                  <TabsTrigger value="peak">Peak</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-sm text-muted-foreground">Chart Type:</span>
              <Tabs value={chartType} onValueChange={(value) => setChartType(value as any)}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="timeline">Timeline</TabsTrigger>
                  <TabsTrigger value="bar">Top Sources</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="ml-4 flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Orientation:</span>
                <Tabs value={orientation} onValueChange={(value) => setOrientation(value as any)}>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="horizontal">Time →</TabsTrigger>
                    <TabsTrigger value="vertical">Time ↑</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </div>
          </div>

          {/* Charts */}
          <Tabs value={chartType} onValueChange={(value) => setChartType(value as any)}>
            <TabsContent value="timeline" className="space-y-4">
              <div className="h-96">
                <ResponsiveContainer width="100%" height="100%">
                  {orientation === 'horizontal' ? (
                    <ScatterChart margin={{ top: 20, right: 30, bottom: 60, left: 120 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                      <XAxis
                        type="number"
                        dataKey="x"
                        domain={xDomain ? [xDomain[0], xDomain[1]] as any : ['dataMin', 'dataMax']}
                        tickFormatter={(value) => new Date(value).toLocaleString()}
                        angle={-30}
                        textAnchor="end"
                        height={60}
                      />
                      <YAxis
                        type="category"
                        dataKey="y"
                        width={110}
                        tick={{ fontSize: 12 }}
                      />
                      <ZAxis dataKey="flood_count" range={[60, 300]} />
                      <Tooltip content={<TimelineTooltip />} />
                      <Scatter data={timelineData} isAnimationActive={false}>
                        {timelineData.map((entry, index) => {
                          const fill = isMetaSource(entry.y) ? 'hsl(var(--muted))' : getPriorityColor(entry.priority);
                          const stroke = isMetaSource(entry.y) ? 'var(--border)' : undefined;
                          return <Cell key={`cell-${index}`} fill={fill} stroke={stroke} />
                        })}
                      </Scatter>
                    </ScatterChart>
                  ) : (
                    <ScatterChart margin={{ top: 20, right: 30, bottom: 40, left: 120 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                      <XAxis
                        type="category"
                        dataKey="y"
                        tick={{ fontSize: 11 }}
                        angle={-30}
                        textAnchor="end"
                        height={60}
                      />
                      <YAxis
                        type="number"
                        dataKey="x"
                        domain={xDomain ? [xDomain[0], xDomain[1]] as any : ['dataMin', 'dataMax']}
                        tickFormatter={(value) => new Date(value).toLocaleString()}
                        width={150}
                      />
                      <ZAxis dataKey="flood_count" range={[60, 300]} />
                      <Tooltip content={<TimelineTooltip />} />
                      <Scatter data={timelineData} isAnimationActive={false}>
                        {timelineData.map((entry, index) => {
                          const fill = isMetaSource(entry.y) ? 'hsl(var(--muted))' : getPriorityColor(entry.priority);
                          const stroke = isMetaSource(entry.y) ? 'var(--border)' : undefined;
                          return <Cell key={`cell-${index}`} fill={fill} stroke={stroke} />
                        })}
                      </Scatter>
                    </ScatterChart>
                  )}
                </ResponsiveContainer>
              </div>
              <div className="text-sm text-muted-foreground bg-accent p-3 rounded-lg">
                <div className="font-medium mb-1">How to read this chart:</div>
                <ul className="space-y-1">
                  <li>• <strong>X-axis:</strong> Peak window start time</li>
                  <li>• <strong>Y-axis:</strong> Source names (alarm sources)</li>
                  <li>• <strong>Dot size:</strong> Flood count (larger = more events in peak window)</li>
                  <li>• <strong>Dot color:</strong> Priority level (Dark green = High, Base green = Medium, Light green = Low)</li>
                  <li>• <strong>Hover:</strong> Shows peak window (start → end) and details</li>
                  <li>• <strong>Definitions:</strong> Unhealthy = hits ≥ threshold (10) in a fixed 10‑min bin; Flood Count = max events in any sliding 10‑min window within the incident (used for dot size).</li>
                </ul>
              </div>
            </TabsContent>

            <TabsContent value="bar" className="space-y-4">
              <div className="h-96">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sourceHitsData} margin={{ top: 20, right: 30, bottom: 60, left: 100 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                    <XAxis 
                      dataKey="source"
                      angle={-45}
                      textAnchor="end"
                      height={80}
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis />
                    <Tooltip 
                      formatter={(value, name) => [value, name === 'totalFlood' ? 'Total Flood Count' : name]}
                      labelFormatter={(label) => `Source: ${label}`}
                    />
                    <Legend />
                    <Bar dataKey="totalFlood" fill={CHART_GREEN_DARK} name="Total Flood Count">
                      {sourceHitsData.map((entry, index) => {
                        const fill = isMetaSource(entry.source) ? 'hsl(var(--muted))' : CHART_GREEN_DARK;
                        const stroke = isMetaSource(entry.source) ? 'var(--border)' : undefined;
                        return <Cell key={`cell-${index}`} fill={fill} stroke={stroke} />
                      })}
                    </Bar>
                    <Bar dataKey="incidents" fill={CHART_GREEN_LIGHT} name="Frequency" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="text-sm text-muted-foreground bg-accent p-3 rounded-lg">
                <div className="font-medium mb-1">Top unhealthy sources by total flood count:</div>
                <ul className="space-y-1">
                  <li>• <strong>Dark green bars:</strong> Total flood count across all windows</li>
                  <li>• <strong>Light green bars:</strong> Number of unhealthy 10-minute windows (Frequency)</li>
                  <li>• Sources are ranked by total flood count (most problematic first)</li>
                </ul>
              </div>
            </TabsContent>
          </Tabs>

          {/* Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
            <div className="p-3 rounded-lg" style={{backgroundColor: CHART_GREEN_PALE}}>
              <div className="font-semibold" style={{color: CHART_GREEN_DARK}}>Frequency</div>
              <div className="text-2xl font-bold" style={{color: CHART_GREEN_DARK}}>{filteredRecords.length}</div>
            </div>
            <div className="p-3 rounded-lg" style={{backgroundColor: CHART_GREEN_PALE}}>
              <div className="font-semibold" style={{color: CHART_GREEN_DARK}}>Unique Sources</div>
              <div className="text-2xl font-bold" style={{color: CHART_GREEN_DARK}}>
                {new Set(filteredRecords.map(r => r.source)).size}
              </div>
            </div>
            <div className="p-3 rounded-lg" style={{backgroundColor: CHART_GREEN_PALE}}>
              <div className="font-semibold" style={{color: CHART_GREEN_DARK}}>Total Flood (Severity)</div>
              <div className="text-2xl font-bold" style={{color: CHART_GREEN_DARK}}>
                {filteredRecords.reduce((sum, r: any) => sum + (r.flood_count ?? r.hits ?? 0), 0)}
              </div>
            </div>
            <div className="p-3 rounded-lg" style={{backgroundColor: CHART_GREEN_PALE}}>
              <div className="font-semibold" style={{color: CHART_GREEN_DARK}}>Avg Flood/Frequency</div>
              <div className="text-2xl font-bold" style={{color: CHART_GREEN_DARK}}>
                {filteredRecords.length > 0 
                  ? Math.round(
                      filteredRecords.reduce((sum, r: any) => sum + (r.flood_count ?? r.hits ?? 0), 0) / filteredRecords.length * 10
                    ) / 10
                  : 0
                }
              </div>
            </div>
          </div>

          {/* Debug Information - Remove in production */}
          {process.env.NODE_ENV === 'development' && (
            <div className="mt-4 p-3 bg-accent rounded-lg text-xs text-muted-foreground">
              <div className="font-semibold mb-2">Debug Info:</div>
              <div>API Response Count: {data?.count || 'N/A'}</div>
              <div>Raw Records Length: {data?.records?.length || 0}</div>
              <div>Filtered Records Length: {filteredRecords.length}</div>
              <div>Selected Priority: {selectedPriority}</div>
              <div>Time Range: {timeRange}</div>
              <div>Selected Month: {selectedMonth}</div>
              <div>Window Mode: {windowMode}</div>
              <div>Loading: {loading.toString()}</div>
              <div>Error: {error || 'None'}</div>
              {data?.records?.length > 0 && (
                <div className="mt-2">
                  <div>Sample Record:</div>
                  <pre className="text-xs bg-card p-2 rounded mt-1 overflow-auto">
                    {JSON.stringify(data.records[0], null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default UnhealthySourcesChart;
