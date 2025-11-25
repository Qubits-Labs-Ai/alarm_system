import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';

interface DashboardMockupProps {
    className?: string;
    variant?: 'browser' | 'floating';
    children?: React.ReactNode;
}

export function DashboardMockup({
    className,
    variant = 'browser',
    children
}: DashboardMockupProps) {
    if (variant === 'browser') {
        return (
            <div className={cn(
                "relative w-full max-w-5xl mx-auto",
                "rounded-xl overflow-hidden",
                "shadow-2xl shadow-primary/10",
                "border border-border/40",
                "bg-card",
                "transform transition-all duration-500",
                "hover:scale-[1.02] hover:shadow-2xl hover:shadow-primary/20",
                className
            )}>
                {/* Browser Chrome */}
                <div className="bg-muted border-b border-border p-3 flex items-center gap-2">
                    <div className="flex gap-2">
                        <div className="w-3 h-3 rounded-full bg-red-500/80" />
                        <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                        <div className="w-3 h-3 rounded-full bg-green-500/80" />
                    </div>
                    <div className="flex-1 mx-4 bg-background rounded px-3 py-1 text-xs text-muted-foreground">
                        https://alarm-system.engro.com/dashboard
                    </div>
                </div>

                {/* Dashboard Content */}
                <div className="relative bg-background p-6">
                    {children || (
                        <div className="aspect-video bg-gradient-to-br from-muted/50 to-muted/20 rounded-lg flex items-center justify-center">
                            <div className="text-center">
                                <div className="text-6xl mb-4">📊</div>
                                <p className="text-muted-foreground">Dashboard Preview</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // Floating card variant
    return (
        <Card className={cn(
            "relative w-full max-w-4xl mx-auto p-6",
            "bg-card/50 backdrop-blur-xl",
            "border-2 border-primary/20",
            "shadow-2xl shadow-primary/20",
            "rounded-2xl",
            "transform transition-all duration-500",
            "hover:-translate-y-2 hover:shadow-3xl hover:shadow-primary/30",
            "hover:border-primary/40",
            className
        )}>
            {children || (
                <div className="aspect-video bg-gradient-to-br from-primary/10 via-primary/5 to-transparent rounded-xl flex items-center justify-center border border-primary/20">
                    <div className="text-center">
                        <div className="text-6xl mb-4">✨</div>
                        <p className="text-muted-foreground font-medium">Live Dashboard Preview</p>
                    </div>
                </div>
            )}
        </Card>
    );
}
