import { cn } from '@/lib/utils';

interface GradientOrbProps {
    className?: string;
    size?: 'sm' | 'md' | 'lg' | 'xl';
    color?: 'green' | 'blue' | 'purple';
    animated?: boolean;
}

export function GradientOrb({
    className,
    size = 'lg',
    color = 'green',
    animated = true
}: GradientOrbProps) {
    const sizeClasses = {
        sm: 'w-64 h-64',
        md: 'w-96 h-96',
        lg: 'w-[600px] h-[600px]',
        xl: 'w-[800px] h-[800px]'
    };

    const colorClasses = {
        green: 'bg-gradient-to-br from-[#a3e635]/30 via-[#09b073]/20 to-[#017944]/10',
        blue: 'bg-gradient-to-br from-blue-500/30 via-blue-600/20 to-blue-700/10',
        purple: 'bg-gradient-to-br from-purple-500/30 via-purple-600/20 to-purple-700/10'
    };

    return (
        <div
            className={cn(
                "absolute rounded-full blur-3xl opacity-50 pointer-events-none",
                sizeClasses[size],
                colorClasses[color],
                animated && "animate-aurora",
                className
            )}
            style={{
                filter: 'blur(80px)',
            }}
        />
    );
}
