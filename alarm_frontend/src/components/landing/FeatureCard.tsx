import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { LucideIcon } from 'lucide-react';

interface FeatureCardProps {
    icon: LucideIcon;
    title: string;
    description: string;
    className?: string;
    iconColor?: string;
    gradient?: boolean;
}

export function FeatureCard({
    icon: Icon,
    title,
    description,
    className,
    iconColor = 'text-primary',
    gradient = true
}: FeatureCardProps) {
    return (
        <Card className={cn(
            "group relative h-full overflow-hidden",
            "bg-card hover:bg-card/80",
            "border-border/40 hover:border-primary/50",
            "transition-all duration-300",
            "hover:shadow-xl hover:shadow-primary/20",
            "hover:-translate-y-2",
            className
        )}>
            {/* Gradient overlay */}
            {gradient && (
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            )}

            {/* Icon glow effect */}
            <div className="absolute -top-10 -right-10 w-32 h-32 bg-primary/20 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

            <CardContent className="relative p-6 h-full flex flex-col">
                {/* Icon container with enhanced hover effect */}
                <div className="mb-4 relative">
                    <div className={cn(
                        "p-3 rounded-xl w-fit",
                        "bg-primary/10 group-hover:bg-primary/20",
                        "transition-all duration-300",
                        "group-hover:scale-110 group-hover:rotate-3"
                    )}>
                        {/* Glow ring */}
                        <div className="absolute inset-0 rounded-xl bg-primary/30 blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                        <Icon className={cn("h-6 w-6 relative z-10", iconColor)} />
                    </div>
                </div>

                {/* Content */}
                <h3 className="text-lg font-bold text-foreground mb-2 group-hover:text-primary transition-colors">
                    {title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed flex-1">
                    {description}
                </p>

                {/* Hover indicator */}
                <div className="mt-4 flex items-center gap-2 text-primary font-medium text-sm opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-2 group-hover:translate-y-0">
                    <span>Learn more</span>
                    <svg className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                </div>
            </CardContent>
        </Card>
    );
}
