import React, { useEffect, useMemo, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar as CalendarIcon, Clock } from 'lucide-react';

type ISO = string;

export interface DateTimeRangeValue {
  startTime?: ISO;
  endTime?: ISO;
}

interface Props {
  value?: DateTimeRangeValue;
  onApply: (start?: ISO, end?: ISO) => void;
  onClear?: () => void;
  className?: string;
  label?: string;
  // Optional domain to hint UI (non-blocking)
  domainStartISO?: string;
  domainEndISO?: string;
}

function toHHMM(date?: Date): string {
  if (!date) return '';
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function toLocalDate(iso?: string): Date | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? undefined : d;
}

function composeISO(d?: Date, hm?: string): string | undefined {
  if (!d) return undefined;
  const [hStr, mStr] = (hm || '00:00').split(':');
  const h = Math.max(0, Math.min(23, Number(hStr || 0)));
  const m = Math.max(0, Math.min(59, Number(mStr || 0)));
  const out = new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
    h,
    m,
    0,
    0
  );
  return out.toISOString();
}

function fmtRangeLabel(start?: string, end?: string): string {
  if (!start || !end) return 'Select range';
  try {
    const s = new Date(start).toLocaleString();
    const e = new Date(end).toLocaleString();
    return `${s} — ${e}`;
  } catch {
    return 'Select range';
  }
}

const DateTimeRangePicker: React.FC<Props> = ({
  value,
  onApply,
  onClear,
  className,
  label = 'Date range',
  domainStartISO,
  domainEndISO,
}) => {
  const [open, setOpen] = useState(false);
  const initialFrom = toLocalDate(value?.startTime);
  const initialTo = toLocalDate(value?.endTime);

  const [from, setFrom] = useState<Date | undefined>(initialFrom);
  const [to, setTo] = useState<Date | undefined>(initialTo);
  const [fromHM, setFromHM] = useState<string>(toHHMM(initialFrom));
  const [toHM, setToHM] = useState<string>(toHHMM(initialTo));

  useEffect(() => {
    const f = toLocalDate(value?.startTime);
    const t = toLocalDate(value?.endTime);
    setFrom(f);
    setTo(t);
    setFromHM(toHHMM(f));
    setToHM(toHHMM(t));
  }, [value?.startTime, value?.endTime]);

  // react-day-picker range selection needs a single object {from,to}
  const selected = useMemo(() => ({ from, to }), [from, to]);

  // Optional domain hints
  const fromDate = useMemo(() => toLocalDate(domainStartISO), [domainStartISO]);
  const toDate = useMemo(() => toLocalDate(domainEndISO), [domainEndISO]);

  function handleDaySelect(range: any) {
    const rFrom: Date | undefined = range?.from;
    const rTo: Date | undefined = range?.to;
    setFrom(rFrom);
    setTo(rTo);
    if (rFrom && !fromHM) setFromHM('00:00');
    if (rTo && !toHM) setToHM('23:59');
  }

  function handleApply() {
    const sIso = composeISO(from, fromHM || '00:00');
    const eIso = composeISO(to, toHM || '23:59');
    onApply(sIso, eIso);
    setOpen(false);
  }

  function handleClear() {
    setFrom(undefined);
    setTo(undefined);
    setFromHM('');
    setToHM('');
    onClear?.();
    setOpen(false);
  }

  return (
    <div className={className}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="justify-start w-full sm:w-auto gap-2">
            <CalendarIcon className="h-4 w-4" />
            <span className="truncate max-w-[60vw] md:max-w-[30vw]">
              {fmtRangeLabel(value?.startTime, value?.endTime)}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-full p-3">
          <div className="flex flex-col gap-3 min-w-[640px]">
            <div className="text-xs text-muted-foreground px-1">{label}</div>
            <Calendar
              mode="range"
              selected={selected as any}
              onSelect={handleDaySelect as any}
              numberOfMonths={2}
              fromDate={fromDate}
              toDate={toDate}
              className="border rounded-md"
            />
            <div className="grid grid-cols-2 gap-6">
              {/* From time */}
              <div className="flex items-center gap-3">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <div className="flex items-center gap-2">
                  <Select value={(fromHM || '00:00').split(':')[0]} onValueChange={(v) => setFromHM(`${v}:${(fromHM || '00:00').split(':')[1]}`)}>
                    <SelectTrigger className="w-[72px]"><SelectValue placeholder="HH" /></SelectTrigger>
                    <SelectContent className="max-h-60 overflow-y-auto">
                      {Array.from({ length: 24 }, (_, h) => (
                        <SelectItem key={h} value={String(h).padStart(2, '0')}>{String(h).padStart(2, '0')}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={(fromHM || '00:00').split(':')[1]} onValueChange={(v) => setFromHM(`${(fromHM || '00:00').split(':')[0]}:${v}`)}>
                    <SelectTrigger className="w-[72px]"><SelectValue placeholder="MM" /></SelectTrigger>
                    <SelectContent className="max-h-60 overflow-y-auto">
                      {Array.from({ length: 12 }, (_, i) => i * 5).map((m) => (
                        <SelectItem key={m} value={String(m).padStart(2, '0')}>{String(m).padStart(2, '0')}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {/* To time */}
              <div className="flex items-center gap-3">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <div className="flex items-center gap-2">
                  <Select value={(toHM || '23:59').split(':')[0]} onValueChange={(v) => setToHM(`${v}:${(toHM || '23:59').split(':')[1]}`)}>
                    <SelectTrigger className="w-[72px]"><SelectValue placeholder="HH" /></SelectTrigger>
                    <SelectContent className="max-h-60 overflow-y-auto">
                      {Array.from({ length: 24 }, (_, h) => (
                        <SelectItem key={h} value={String(h).padStart(2, '0')}>{String(h).padStart(2, '0')}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={(toHM || '23:59').split(':')[1]} onValueChange={(v) => setToHM(`${(toHM || '23:59').split(':')[0]}:${v}`)}>
                    <SelectTrigger className="w-[72px]"><SelectValue placeholder="MM" /></SelectTrigger>
                    <SelectContent className="max-h-60 overflow-y-auto">
                      {Array.from({ length: 12 }, (_, i) => i * 5).map((m) => (
                        <SelectItem key={m} value={String(m).padStart(2, '0')}>{String(m).padStart(2, '0')}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={handleClear}>
                Clear
              </Button>
              <Button size="sm" onClick={handleApply} disabled={!from || !to}>
                Apply
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default DateTimeRangePicker;
