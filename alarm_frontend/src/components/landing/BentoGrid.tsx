import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { ReactNode } from 'react';

interface BentoGridProps {
    children: ReactNode;
    className?: string;
}

export function BentoGrid({ children, className }: BentoGridProps) {
    return (
        <div className={cn(
            "grid auto-rows-[192px] grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4",
            className
        )}>
            {children}
        </div>
    );
}

interface BentoCardProps {
    className?: string;
    children: ReactNode;
    title?: string;
    description?: string;
    icon?: ReactNode;
    span?: 'default' | 'wide' | 'tall' | 'large';
    gradient?: boolean;
}

export function BentoCard({
    className,
    children,
    title,
    description,
    icon,
    span = 'default',
    gradient = false
}: BentoCardProps) {
    const spanClasses = {
        default: '',
        wide: 'md:col-span-2',
        tall: 'md:row-span-2',
        large: 'md:col-span-2 md:row-span-2'
    };

    return (
        <Card className={cn(
            "group relative overflow-hidden",
            "bg-card hover:bg-card/80",
            "border-border/40 hover:border-primary/40",
            "transition-all duration-300",
            "hover:shadow-lg hover:shadow-primary/10",
            "hover:-translate-y-1",
            spanClasses[span],
            className
        )}>
            {/* Gradient overlay on hover */}
            {gradient && (
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            )}

            <div className="relative h-full p-6 flex flex-col">
                {/* Header */}
                {(icon || title) && (
                    <div className="mb-4">
                        {icon && (
                            <div className="mb-3 p-2.5 bg-primary/10 rounded-lg w-fit group-hover:bg-primary/20 transition-colors">
                                {icon}
                            </div>
                        )}
                        {title && (
                            <h3 className="text-lg font-bold text-foreground mb-1">{title}</h3>
                        )}
                        {description && (
                            <p className="text-sm text-muted-foreground">{description}</p>
                        )}
                    </div>
                )}

                {/* Content */}
                <div className="flex-1 flex items-center justify-center">
                    {children}
                </div>
            </div>
        </Card>
    );
}
