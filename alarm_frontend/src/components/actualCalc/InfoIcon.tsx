/**
 * InfoIcon - Reusable info icon with tooltip for displaying KPI calculation formulas
 * Displays an info icon that shows a tooltip with formula details on hover
 */

import { Info } from 'lucide-react';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';

interface InfoIconProps {
    formula: string | React.ReactNode;
    title?: string;
    className?: string;
}

export function InfoIcon({ formula, title, className = '' }: InfoIconProps) {
    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Info
                        className={`h-3.5 w-3.5 text-muted-foreground hover:text-foreground transition-colors cursor-help ${className}`}
                        aria-label={title || 'Calculation formula'}
                    />
                </TooltipTrigger>
                <TooltipContent
                    className="max-w-sm p-3"
                    side="top"
                    align="center"
                >
                    <div className="space-y-1.5">
                        {title && (
                            <p className="font-semibold text-sm text-foreground">{title}</p>
                        )}
                        <div className="text-xs text-muted-foreground leading-relaxed">
                            {typeof formula === 'string' ? (
                                <code className="bg-muted px-1.5 py-0.5 rounded text-foreground font-mono text-xs">
                                    {formula}
                                </code>
                            ) : (
                                formula
                            )}
                        </div>
                    </div>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}
