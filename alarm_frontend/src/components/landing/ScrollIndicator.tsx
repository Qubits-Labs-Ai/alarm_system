import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ScrollIndicatorProps {
    targetId?: string;
    className?: string;
}

export function ScrollIndicator({ targetId = 'features', className }: ScrollIndicatorProps) {
    const handleClick = () => {
        const element = document.getElementById(targetId);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth' });
        }
    };

    return (
        <button
            onClick={handleClick}
            className={cn(
                "group flex flex-col items-center gap-2 text-muted-foreground hover:text-foreground transition-all",
                "animate-bounce cursor-pointer",
                className
            )}
            aria-label="Scroll to next section"
        >
            <span className="text-sm font-medium opacity-70 group-hover:opacity-100">Scroll to explore</span>
            <div className="p-2 rounded-full border-2 border-current group-hover:border-lime-accent group-hover:text-lime-accent transition-all">
                <ChevronDown className="h-5 w-5" />
            </div>
        </button>
    );
}
