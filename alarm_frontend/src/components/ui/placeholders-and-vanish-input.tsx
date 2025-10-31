import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Square } from "lucide-react";
import { cn } from "@/lib/utils";

export type PlaceholdersAndVanishInputProps = {
  placeholders: string[];
  onChange?: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onSubmit?: (e: React.FormEvent<HTMLFormElement>) => void;
  value?: string;
  className?: string;
  disabled?: boolean;
  multiline?: boolean;
  minRows?: number; // only for multiline
  maxRows?: number; // only for multiline
  sendOnEnter?: boolean; // Enter to send, Shift+Enter for newline
  isStreaming?: boolean; // when true, show Stop instead of Send
  onStop?: () => void;   // called when Stop is pressed or Esc
};

export function PlaceholdersAndVanishInput({
  placeholders,
  onChange,
  onSubmit,
  value,
  className,
  disabled,
  multiline = false,
  minRows = 1,
  maxRows = 8,
  sendOnEnter = true,
  isStreaming = false,
  onStop,
}: PlaceholdersAndVanishInputProps) {
  const [index, setIndex] = useState(0);
  const [isActive, setIsActive] = useState(true);
  const intervalRef = useRef<number | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Rotate placeholder every 3s when input is empty and not focused typing
  useEffect(() => {
    if (!isActive || (value && value.length > 0)) return;
    intervalRef.current && window.clearInterval(intervalRef.current);
    intervalRef.current = window.setInterval(() => {
      setIndex((i) => (i + 1) % Math.max(1, placeholders.length));
    }, 3000);
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, [isActive, value, placeholders.length]);

  const activePlaceholder = useMemo(() => placeholders[index] ?? "", [index, placeholders]);

  // Auto-resize the textarea height from content up to maxRows
  const autoResize = () => {
    if (!textareaRef.current) return;
    const el = textareaRef.current;
    el.style.height = "auto"; // reset to measure
    const lineHeight = parseInt(window.getComputedStyle(el).lineHeight || "24", 10);
    const maxHeight = lineHeight * Math.max(minRows, maxRows);
    const next = Math.min(el.scrollHeight, maxHeight);
    el.style.height = `${next}px`;
  };

  useEffect(() => {
    // Resize on mount and when value changes
    if (multiline) autoResize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, multiline]);

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        onSubmit?.(e);
      }}
      className={cn("relative z-10 w-full", className)}
    >
      {multiline ? (
        <textarea
          ref={textareaRef}
          rows={minRows}
          value={value}
          onChange={(e) => {
            onChange?.(e);
            autoResize();
          }}
          onFocus={() => setIsActive(false)}
          onBlur={() => setIsActive(true)}
          onKeyDown={(e) => {
            // Enter to send (unless Shift held). Shift+Enter inserts newline.
            if (sendOnEnter && e.key === "Enter" && !e.shiftKey && !disabled) {
              e.preventDefault();
              formRef.current?.requestSubmit();
              return;
            }
            // Ctrl/Cmd + Enter also sends
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !disabled) {
              e.preventDefault();
              formRef.current?.requestSubmit();
              return;
            }
            // Esc stops streaming
            if (e.key === "Escape" && isStreaming) {
              e.preventDefault();
              onStop?.();
              return;
            }
          }}
          placeholder={activePlaceholder}
          disabled={disabled}
          className={cn(
            "w-full rounded-full bg-card backdrop-blur supports-[backdrop-filter]:backdrop-blur border border-border/70 shadow-sm",
            "px-6 pr-14 py-3 text-base outline-none leading-6 transition-all duration-200",
            "placeholder:text-muted-foreground/70 focus:ring-2 focus:ring-primary/25",
            "max-h-48 overflow-y-auto resize-none",
            disabled && "opacity-60 cursor-not-allowed"
          )}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange?.(e)}
          onFocus={() => setIsActive(false)}
          onBlur={() => setIsActive(true)}
          onKeyDown={(e) => {
            if (sendOnEnter && e.key === "Enter" && !disabled) {
              e.preventDefault();
              formRef.current?.requestSubmit();
            }
            if (e.key === "Escape" && isStreaming) {
              e.preventDefault();
              onStop?.();
            }
          }}
          placeholder={activePlaceholder}
          disabled={disabled}
          className={cn(
            "h-14 w-full rounded-full bg-card backdrop-blur supports-[backdrop-filter]:backdrop-blur border border-border/70 shadow-sm",
            "px-6 pr-14 text-base outline-none transition-all duration-200",
            "placeholder:text-muted-foreground/70 focus:ring-2 focus:ring-primary/25",
            disabled && "opacity-60 cursor-not-allowed"
          )}
        />
      )}
      <button
        type={isStreaming ? "button" : "submit"}
        onClick={() => {
          if (isStreaming) onStop?.();
        }}
        disabled={!isStreaming && disabled}
        className={cn(
          "absolute right-1.5 top-1/2 -translate-y-1/2",
          "h-10 w-10 rounded-full grid place-items-center",
          isStreaming
            ? "bg-muted/90 text-foreground ring-1 ring-border/70 shadow-sm hover:bg-muted/80"
            : "bg-primary text-primary-foreground shadow-sm hover:opacity-90",
          "transition-transform duration-150 active:scale-95",
          !isStreaming && disabled && "opacity-50"
        )}
        aria-label={isStreaming ? "Stop" : "Send"}
      >
        {isStreaming ? <Square className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
      </button>
    </form>
  );
}
