import { Clock, Zap, Shield, TrendingUp, CheckCircle } from 'lucide-react';

const stats = [
    { icon: Shield, label: '99.9% System Uptime', color: 'text-lime-accent' },
    { icon: Zap, label: 'Sub-100ms Response Time', color: 'text-lime-accent' },
    { icon: Clock, label: '24/7 Real-Time Monitoring', color: 'text-lime-accent' },
    { icon: CheckCircle, label: 'Industry Standard Compliant', color: 'text-lime-accent' },
    { icon: TrendingUp, label: 'Continuous Performance Tracking', color: 'text-lime-accent' },
];

export const StatsTicker = () => {
    // Duplicate stats for seamless infinite scroll
    const duplicatedStats = [...stats, ...stats, ...stats];

    return (
        <div className="relative w-full overflow-hidden py-8 bg-muted/20 border-y border-border/40">
            {/* Gradient fade edges */}
            <div className="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-background to-transparent z-10" />
            <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-background to-transparent z-10" />

            {/* Scrolling container */}
            <div className="flex gap-12 animate-scroll-left hover:pause-animation">
                {duplicatedStats.map((stat, index) => {
                    const Icon = stat.icon;
                    return (
                        <div
                            key={index}
                            className="flex items-center gap-3 whitespace-nowrap px-6 py-3 bg-card/30 backdrop-blur-sm rounded-full border border-border/40"
                        >
                            <Icon className={`h-5 w-5 ${stat.color}`} />
                            <span className="text-sm font-medium text-foreground">
                                {stat.label}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
