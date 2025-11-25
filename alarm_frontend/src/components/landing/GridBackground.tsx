import { cn } from '@/lib/utils';

interface GridBackgroundProps {
    className?: string;
    gridSize?: number;
    gridColor?: string;
    fadeEdges?: boolean;
}

export function GridBackground({
    className,
    gridSize = 50,
    gridColor = 'rgba(163, 230, 53, 0.08)',
    fadeEdges = true
}: GridBackgroundProps) {
    return (
        <div className={cn("absolute inset-0 overflow-hidden", className)}>
            {/* Grid pattern */}
            <div
                className="absolute inset-0"
                style={{
                    backgroundImage: `
            linear-gradient(to right, ${gridColor} 1px, transparent 1px),
            linear-gradient(to bottom, ${gridColor} 1px, transparent 1px)
          `,
                    backgroundSize: `${gridSize}px ${gridSize}px`,
                }}
            />

            {/* Fade edges for depth */}
            {fadeEdges && (
                <>
                    <div className="absolute inset-0 bg-gradient-to-b from-background via-transparent to-background opacity-60" />
                    <div className="absolute inset-0 bg-gradient-to-r from-background via-transparent to-background opacity-40" />
                </>
            )}
        </div>
    );
}
