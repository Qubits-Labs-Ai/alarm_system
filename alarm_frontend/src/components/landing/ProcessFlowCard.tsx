import { LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface ProcessFlowCardProps {
    icon: LucideIcon;
    title: string;
    description: string;
    step: number;
    visualElement?: React.ReactNode;
    accentColor?: string;
    delay?: number;
}

export const ProcessFlowCard = ({
    icon: Icon,
    title,
    description,
    step,
    visualElement,
    accentColor = 'lime-accent',
    delay = 0,
}: ProcessFlowCardProps) => {
    return (
        <div
            className="motion-safe:animate-fade-up motion-safe:opacity-0"
            style={{ animationFillMode: 'forwards', animationDelay: `${delay}ms` }}
        >
            <Card className="group relative h-full bg-card/50 backdrop-blur-sm border-border/40 hover:border-lime-accent/40 transition-all duration-300 hover:-translate-y-2 hover:shadow-xl hover:shadow-lime-accent/10">
                <CardContent className="p-6 flex flex-col items-center text-center space-y-4">
                    {/* Step Number Badge */}
                    <div className="absolute top-4 right-4 w-8 h-8 rounded-full bg-lime-accent/10 border border-lime-accent/30 flex items-center justify-center">
                        <span className="text-xs font-bold text-lime-accent">{step}</span>
                    </div>

                    {/* Icon with Animation */}
                    <div className="relative">
                        <div className="absolute inset-0 bg-lime-accent/20 rounded-full blur-xl group-hover:blur-2xl transition-all" />
                        <div className="relative p-4 bg-lime-accent/10 rounded-2xl border border-lime-accent/20 group-hover:border-lime-accent/40 transition-all">
                            <Icon className="h-8 w-8 text-lime-accent group-hover:scale-110 transition-transform" />
                        </div>
                    </div>

                    {/* Title */}
                    <h3 className="text-lg font-bold text-foreground group-hover:text-lime-accent transition-colors">
                        {title}
                    </h3>

                    {/* Description */}
                    <p className="text-sm text-muted-foreground leading-relaxed min-h-[60px]">
                        {description}
                    </p>

                    {/* Visual Element */}
                    {visualElement && (
                        <div className="w-full pt-4 border-t border-border/40">
                            {visualElement}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};
