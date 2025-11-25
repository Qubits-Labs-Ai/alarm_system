import { ArrowRight } from 'lucide-react';

interface FlowArrowProps {
    className?: string;
}

export const FlowArrow = ({ className = '' }: FlowArrowProps) => {
    return (
        <div className={`hidden lg:flex items-center justify-center ${className}`}>
            <div className="relative">
                {/* Animated glow effect */}
                <div className="absolute inset-0 bg-lime-accent/20 blur-lg animate-pulse" />

                {/* Arrow */}
                <ArrowRight className="relative h-6 w-6 text-lime-accent/60 animate-pulse" />
            </div>
        </div>
    );
};
