import { cn } from "@/lib/utils";
import React from "react";

type Props = {
  hideLabel?: boolean;
  className?: string;
};

export default function GridSmallBackgroundDemo({ hideLabel = true, className }: Props) {
  return (
    <div className={cn("relative flex h-full min-h-full w-full items-center justify-center bg-background dark:bg-background", className)}>
      <div
        className={cn(
          "absolute inset-0",
          "[background-size:24px_24px]",
          "[background-image:linear-gradient(to_right,hsl(var(--primary)/0.16)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--primary)/0.16)_1px,transparent_1px)]",
          "dark:[background-image:linear-gradient(to_right,hsl(var(--primary)/0.22)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--primary)/0.22)_1px,transparent_1px)]",
          "animate-grid-pan",
        )}
      />
      {/* Subtle vertical fade to blend with content */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background/60" />
      {!hideLabel && (
        <p className="relative z-20 bg-gradient-to-b from-neutral-200 to-neutral-500 bg-clip-text py-8 text-4xl font-bold text-transparent sm:text-7xl">
          Backgrounds
        </p>
      )}
    </div>
  );
}
