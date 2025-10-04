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

  const endMs = useMemo(() => startMs + winMs, [startMs, winMs]);
  const disabled = domainEndMs - domainStartMs < winMs + stepMs;

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
            <Button size="sm" onClick={() => onApply(new Date(startMs).toISOString(), new Date(endMs).toISOString())}>
              Apply
            </Button>
            <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
            {typeof onClear === 'function' && (
              <Button variant="ghost" size="sm" onClick={() => onClear?.()}>Clear</Button>
            )}
          </div>
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
        </>
      )}
    </div>
  );
};

export default TimeBinSlider;
