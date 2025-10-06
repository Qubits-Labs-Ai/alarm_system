import React, { useMemo, useState } from 'react';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';

interface TimeBinSliderProps {
  domainStart: string; // ISO (UTC) string
  domainEnd: string;   // ISO (UTC) string
  initialStart?: string; // ISO for initial start
  windowMinutes?: number; // fixed size, default 10
  stepMinutes?: number;   // default 1
  onApply: (startIso: string, endIso: string) => void;
  onCancel: () => void;
  // Optional presets
  peakWindowStart?: string;
  peakWindowEnd?: string;
  onClear?: () => void;
  // Optional: provide precomputed unhealthy windows (e.g., Top Flood Windows)
  unhealthyWindows?: Array<{ start: string; end: string; label?: string }>;
  // Optional: async validator to detect if current selection has unhealthy data
  validateWindow?: (startIso: string, endIso: string) => Promise<boolean>;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export const TimeBinSlider: React.FC<TimeBinSliderProps> = ({
  domainStart,
  domainEnd,
  initialStart,
  windowMinutes = 10,
  stepMinutes = 1,
  onApply,
  onCancel,
  peakWindowStart,
  peakWindowEnd,
  onClear,
  unhealthyWindows,
  validateWindow,
}) => {
  const domainStartMs = useMemo(() => new Date(domainStart).getTime(), [domainStart]);
  const domainEndMs = useMemo(() => new Date(domainEnd).getTime(), [domainEnd]);
  const winMs = windowMinutes * 60 * 1000;
  const stepMs = stepMinutes * 60 * 1000;
  const maxStartMs = Math.max(domainStartMs, domainEndMs - winMs);

  const initialStartMs = useMemo(() => {
    if (initialStart) return new Date(initialStart).getTime();
    // default to last 10 minutes in domain
    return maxStartMs;
  }, [initialStart, maxStartMs]);

  const [startMs, setStartMs] = useState<number>(clamp(initialStartMs, domainStartMs, maxStartMs));
  const [checking, setChecking] = useState<boolean>(false);
  const [isUnhealthy, setIsUnhealthy] = useState<boolean>(true); // default true so Apply isn't disabled initially
  const validateRef = React.useRef<number>(0);

  const endMs = useMemo(() => startMs + winMs, [startMs, winMs]);
  const disabled = domainEndMs - domainStartMs < winMs + stepMs;

  // Debounced validation when selection changes
  React.useEffect(() => {
    if (!validateWindow) return;
    const myId = ++validateRef.current;
    setChecking(true);
    const timer = setTimeout(async () => {
      try {
        const ok = await validateWindow(new Date(startMs).toISOString(), new Date(endMs).toISOString());
        if (validateRef.current === myId) setIsUnhealthy(Boolean(ok));
      } catch {
        if (validateRef.current === myId) setIsUnhealthy(true);
      } finally {
        if (validateRef.current === myId) setChecking(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [startMs, endMs, validateWindow]);

  const onSliderChange = (vals: number[]) => {
    const minutesFromStart = vals[0];
    const nextStart = domainStartMs + minutesFromStart * stepMs;
    setStartMs(clamp(nextStart, domainStartMs, maxStartMs));
  };

  const sliderValue = useMemo(() => {
    const offset = startMs - domainStartMs;
    return [Math.round(offset / stepMs)];
  }, [startMs, domainStartMs, stepMs]);

  const maxSteps = Math.floor((maxStartMs - domainStartMs) / stepMs);

  return (
    <div className="w-[320px] p-2">
      <div className="text-sm font-medium mb-2">Select 10-minute window</div>
      {disabled ? (
        <div className="text-xs text-muted-foreground">Not enough data to select a 10-minute window.</div>
      ) : (
        <>
          <Slider 
            min={0} 
            max={Math.max(0, maxSteps)} 
            step={1}
            value={sliderValue}
            onValueChange={onSliderChange}
          />
          <div className="mt-3 text-xs text-muted-foreground">
            <div>
              Local: {new Date(startMs).toLocaleString()} — {new Date(endMs).toLocaleString()}
            </div>
            <div>
              UTC: {new Date(startMs).toLocaleString(undefined, { timeZone: 'UTC' })} — {new Date(endMs).toLocaleString(undefined, { timeZone: 'UTC' })}
            </div>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <Button size="sm" onClick={() => onApply(new Date(startMs).toISOString(), new Date(endMs).toISOString())} disabled={Boolean(validateWindow) && !isUnhealthy}>
              Apply
            </Button>
            <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
            {typeof onClear === 'function' && (
              <Button variant="ghost" size="sm" onClick={() => onClear?.()}>Clear</Button>
            )}
          </div>
          {Boolean(validateWindow) && (
            <div className="mt-2 text-xs text-muted-foreground">
              {checking ? 'Checking window…' : (isUnhealthy ? '' : 'Selected window is healthy (no sources ≥ 10). Choose from Unhealthy windows or adjust the slider.')}
            </div>
          )}
          <div className="flex items-center gap-2 mt-2">
            {peakWindowStart && peakWindowEnd && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => {
                  const s = clamp(new Date(peakWindowStart).getTime(), domainStartMs, maxStartMs);
                  setStartMs(s);
                }}
              >
                Peak window
              </Button>
            )}
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                setStartMs(maxStartMs);
              }}
            >
              Last 10m
            </Button>
          </div>
          {Array.isArray(unhealthyWindows) && unhealthyWindows.length > 0 && (
            <div className="mt-3">
              <div className="text-xs text-muted-foreground mb-1">Unhealthy windows</div>
              <div className="flex flex-col gap-1 max-h-48 overflow-auto pr-1">
                {unhealthyWindows.slice(0, 20).map((w, i) => (
                  <Button
                    key={`${w.start}-${w.end}-${i}`}
                    variant="ghost"
                    size="sm"
                    className="justify-start"
                    onClick={() => onApply(w.start, w.end)}
                    title={`${new Date(w.start).toLocaleString()} — ${new Date(w.end).toLocaleString()}`}
                  >
                    {w.label || `${new Date(w.start).toLocaleString()} — ${new Date(w.end).toLocaleString()}`}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default TimeBinSlider;
