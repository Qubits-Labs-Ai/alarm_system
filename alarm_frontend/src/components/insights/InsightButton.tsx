import { Button } from "@/components/ui/button";
import { Lightbulb } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface InsightButtonProps {
  onClick: () => void;
  className?: string;
  disabled?: boolean;
}

export const InsightButton = ({ onClick, className, disabled }: InsightButtonProps) => {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="default"
            size="sm"
            className={`h-8 px-2.5 sm:px-3 shadow-sm ring-1 ring-primary/20 ${className || ""}`}
            disabled={disabled}
            onClick={onClick}
            aria-label="Get AI Insights"
          >
            <Lightbulb className="h-4 w-4 text-yellow-500" />
            <span className="ml-2 hidden sm:inline">AI Insights</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          Get AI Insights for the current chart
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
