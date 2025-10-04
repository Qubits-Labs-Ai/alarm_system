import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";

import { cn } from "@/lib/utils";

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      // Checked: primary track; Unchecked: use muted with mode-aware opacity for visibility
      // Add a subtle border when unchecked for clearer contrast on both themes
      "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 transition-colors",
      "data-[state=checked]:bg-primary data-[state=checked]:border-transparent",
      "data-[state=unchecked]:bg-muted/60 dark:data-[state=unchecked]:bg-muted/40 data-[state=unchecked]:border-border",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        // Slightly softer shadow; keep thumb readable on both themes
        "pointer-events-none block h-5 w-5 rounded-full bg-gray-200 shadow-md ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0",
      )}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
