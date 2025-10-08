import React, { useEffect, useMemo, useRef, useState } from "react";

export type TextGenerateEffectProps = {
  words: string;
  duration?: number; // seconds for full text
  filter?: boolean; // reserved for visual fade; not used heavily
  className?: string;
  onDone?: () => void;
};

// Simple progressive reveal effect. It reveals the string over `duration` seconds.
export const TextGenerateEffect: React.FC<TextGenerateEffectProps> = ({
  words,
  duration = 2,
  filter = false,
  className,
  onDone,
}) => {
  const text = useMemo(() => String(words || ""), [words]);
  const [count, setCount] = useState(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    // reset when text changes
    setCount(0);
    if (!text.length) {
      onDone?.();
      return;
    }
    const totalMs = Math.max(200, duration * 1000);
    const step = Math.max(8, Math.floor(totalMs / Math.max(1, text.length)));

    const tick = () => {
      setCount((c) => {
        const next = Math.min(text.length, c + 1);
        if (next >= text.length) {
          // done after next frame to ensure last character paint
          window.clearInterval(timerRef.current!);
          timerRef.current = window.setTimeout(() => onDone?.(), 0) as any;
        }
        return next;
      });
    };

    timerRef.current = window.setInterval(tick, step) as any;
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [text, duration, onDone]);

  const visible = text.slice(0, count);

  return (
    <div className={className}>
      <span className="whitespace-pre-wrap">{visible}</span>
      {filter && count < text.length ? (
        <span className="opacity-30">{text.slice(count)}</span>
      ) : null}
    </div>
  );
};
