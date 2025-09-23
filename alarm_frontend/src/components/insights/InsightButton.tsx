import { Button } from "@/components/ui/button";
import { Lightbulb } from "lucide-react";

interface InsightButtonProps {
  onClick: () => void;
  className?: string;
  disabled?: boolean;
}

export const InsightButton = ({ onClick, className, disabled }: InsightButtonProps) => {
  return (
    <Button
      variant="ghost"
      size="icon"
      className={`h-8 w-8 ${className}`}
      disabled={disabled}
      onClick={onClick}
    >
      <Lightbulb className="h-4 w-4" />
      <span className="sr-only">Get AI Insight</span>
    </Button>
  );
};
