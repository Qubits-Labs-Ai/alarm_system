import { useState, useEffect } from 'react';
import { ArrowRight, ShieldCheck, BarChart3, CheckCircle, TrendingUp, AlertTriangle, Activity, Sparkles, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import PixelBlast from '@/components/ui/PixelBlast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { usePlantHealth } from '@/hooks/usePlantHealth';
import { UnhealthyBarChart } from '@/components/dashboard/UnhealthyBarChart';
import engroLogo from '@/assets/engro-logo.png';
import AnimatedChartDisplay from '@/components/landing/AnimatedChartDisplay';

// Motion-aware component for animations
const MotionDiv = ({ children, delay = 0 }: { children: React.ReactNode, delay?: number }) => (
  <div 
    className="motion-safe:animate-fade-up motion-safe:opacity-0" 
    style={{ animationFillMode: 'forwards', animationDelay: `${delay}ms` }}
  >
    {children}
  </div>
);

const LandingPage = () => {
  const [topN, setTopN] = useState<1 | 3>(1);
  const { data, isLoading } = usePlantHealth('pvcI', topN, 60000);
  const metrics = data?.metrics;

  const features = [
    {
      icon: Activity,
      title: 'Real-Time Data Ingestion',
      description: 'Continuously stream and normalize alarm events and source histories for immediate analysis.',
    },
    {
      icon: ShieldCheck,
      title: 'Automated Health Scoring',
      description: 'Each source gets a rolling health score based on flood counts against a defined threshold.',
    },
    {
      icon: AlertTriangle,
      title: 'Instant Anomaly Detection',
      description: 'Surface unhealthy sources and peak windows instantly, allowing for proactive intervention.',
    },
    {
      icon: BarChart3,
      title: 'Actionable Insights',
      description: 'Interactive charts and summaries help prioritize remediation and track performance improvements.',
    }
  ];

  const benefits = [
    'Reduce nuisance alarms and operator cognitive load',
    'Shorten time-to-diagnosis with clear performance hotspots',
    'Track remediation progress with objective health metrics',
    'Improve alarm performance compliance with industry standards',
    'Enable proactive maintenance with predictive trend signals',
    'Seamlessly transition from insight to action in the dashboard',
  ];

  return (
    <div className="min-h-screen bg-background text-foreground font-sans scroll-smooth selection:bg-primary/30">
      {/* Background Aurora */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[150%] h-[120%] bg-[radial-gradient(ellipse_50%_40%_at_50%_0%,hsl(var(--primary)/0.15),transparent_80%)]"></div>
      </div>
      
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/50 backdrop-blur-lg">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img src={engroLogo} alt="Engro Logo" className="h-8 w-auto" />
            <div className="hidden sm:flex items-center gap-3 border-l border-border pl-4">
              <ShieldCheck className="h-6 w-6 text-primary" />
              <div>
                <h1 className="font-bold text-foreground">Alarm Management System</h1>
                <p className="text-xs text-muted-foreground">Powered by Engro Digital</p>
              </div>
            </div>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#features" onClick={(e) => { e.preventDefault(); document.querySelector('#features')?.scrollIntoView({ behavior: 'smooth' }); }} className="hover:text-foreground transition-colors">Features</a>
            <a href="#snapshot" onClick={(e) => { e.preventDefault(); document.querySelector('#snapshot')?.scrollIntoView({ behavior: 'smooth' }); }} className="hover:text-foreground transition-colors">Live Snapshot</a>
            <a href="#benefits" onClick={(e) => { e.preventDefault(); document.querySelector('#benefits')?.scrollIntoView({ behavior: 'smooth' }); }} className="hover:text-foreground transition-colors">Benefits</a>
          </nav>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Button asChild className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold transition-all duration-300 transform hover:scale-105">
              <a href="/signin">Access Dashboard</a>
            </Button>
          </div>
        </div>
      </header>

      <main className="relative z-10 ">
        {/* Hero Section */}
        <section className="relative h-screen flex items-center justify-center overflow-hidden ">
          {/* Interactive background */}
          <div className="absolute h-screen overflow-hidden inset-0 z-0">
            <PixelBlast
              className="absolute inset-0"
              variant="circle"
              pixelSize={6}
              color="#09b073"
              patternScale={3}
              patternDensity={1.2}
              pixelSizeJitter={0.45}
              enableRipples
              rippleSpeed={0.4}
              rippleThickness={0.12}
              rippleIntensityScale={1.5}
              liquid
              liquidStrength={0.12}
              liquidRadius={1.15}
              liquidWobbleSpeed={5}
              speed={0.6}
              edgeFade={0.22}
              transparent
              noiseAmount={0.06}
            />
            <PixelBlast
              className="absolute inset-0"
              variant="square"
              pixelSize={1}
              color="#888888"
              patternScale={1}
              patternDensity={0.2} // Lower density for subtlety
              speed={0.1}
              lineCount={2.0} // Render 2 diagonal lines
              transparent
            />
            {/* Subtle gradient vignette for readability */}
            <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/10 to-background/60" />
          </div>
          {/* Content */}
          <div className="container mx-auto px-6 relative z-10">
            <div className="flex flex-col items-center text-center">
              <MotionDiv>
                <Badge variant="outline" className="mb-6 border-primary/30 bg-primary/10 text-primary py-1 px-4 backdrop-blur-sm">
                  <Sparkles className="h-4 w-4 mr-2 text-primary" />
                  Standards-Aligned Alarm Health Monitoring
                </Badge>
              </MotionDiv>
              <MotionDiv delay={150}>
                <h1 className="text-4xl md:text-6xl lg:text-7xl font-extrabold pb-6 mb-6 bg-clip-text text-transparent bg-gradient-to-r from-foreground to-muted-foreground leading-tight">
                  Transform Alarm Data into Actionable Intelligence
                </h1>
              </MotionDiv>
              <MotionDiv delay={300}>
                <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-3xl mx-auto">
                  Monitor alarm performance in real-time. Quantify source health, surface hotspots, and act with confidence—starting with the PVC-I production line.
                </p>
              </MotionDiv>
              <MotionDiv delay={450}>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Button size="lg" asChild className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-lg px-8 py-6 transition-transform hover:scale-105">
                    <a href="/dashboard">
                      View Live Dashboard <ArrowRight className="ml-2 h-5 w-5" />
                    </a>
                  </Button>
                  <Button size="lg" variant="outline" asChild className="border-border text-foreground bg-background/50 hover:bg-accent/60 backdrop-blur-sm text-lg px-8 py-6">
                    <a href="#features">Learn More</a>
                  </Button>
                </div>
              </MotionDiv>
            </div>
          </div>
        </section>

        {/* Dashboard Preview Section */}
        <section id="snapshot" className="py-24 sm:py-32">
          <div className="container mx-auto px-6">
            <MotionDiv>
                <div className="text-center mb-16">
                    <h2 className="text-3xl md:text-4xl font-bold text-foreground">Live Plant Snapshot: <span className="text-primary">PVC-I</span></h2>
                    <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">An overview of the current alarm system health and top offenders.</p>
                     <p className="text-sm text-muted-foreground/70 mt-2">
                        Last updated: {metrics?.last_updated ? new Date(metrics.last_updated).toLocaleString() : 'Loading...'}
                    </p>
                </div>
            </MotionDiv>
            <MotionDiv delay={200}>
              <div className="grid lg:grid-cols-3 gap-8 items-start">
                {/* Chart */}
                <div className="lg:col-span-2">
                   <UnhealthyBarChart 
                      data={data?.unhealthyBars ?? []}
                      threshold={10}
                      topN={topN}
                      onTopNChange={setTopN}
                      isLoading={isLoading}
                    />
                </div>
                {/* Stats */}
                <div className="space-y-6">
                   <Card className="bg-card border-border">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-primary">
                          <TrendingUp /> Overall Health
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="grid grid-cols-2 gap-4 text-center">
                          <div>
                            <p className="text-4xl font-bold text-[#09b073]">{isLoading ? '—' : `${(metrics?.healthy_percentage ?? 0).toFixed(1)}%`}</p>
                            <p className="text-sm text-muted-foreground">Healthy</p>
                          </div>
                           <div>
                            <p className="text-4xl font-bold text-[#6eb43f]">{isLoading ? '—' : `${(metrics?.unhealthy_percentage ?? 0).toFixed(1)}%`}</p>
                            <p className="text-sm text-muted-foreground">Unhealthy</p>
                          </div>
                      </CardContent>
                   </Card>
                   <Card className="bg-card border-border">
                     <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-muted-foreground">
                          <Activity /> System Load
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="grid grid-cols-2 gap-4 text-center">
                          <div>
                            <p className="text-3xl font-bold text-foreground">{isLoading ? '—' : metrics?.total_sources?.toLocaleString() ?? '—'}</p>
                            <p className="text-sm text-muted-foreground">Sources</p>
                          </div>
                           <div>
                            <p className="text-3xl font-bold text-foreground">{isLoading ? '—' : metrics?.total_files?.toLocaleString() ?? '—'}</p>
                            <p className="text-sm text-muted-foreground">Data Files</p>
                          </div>
                      </CardContent>
                   </Card>
                </div>
              </div>
            </MotionDiv>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="py-24 sm:py-32 bg-muted/20 border-y border-border">
          <div className="container mx-auto px-6">
            <div className="text-center mb-16 max-w-3xl mx-auto">
              <h2 className="text-3xl md:text-4xl font-bold text-foreground">A Four-Step Process to Clarity</h2>
              <p className="mt-4 text-lg text-muted-foreground">From raw alarm events to actionable insights—every stage is designed for clarity, speed, and compliance.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {features.map((feature, index) => {
                const Icon = feature.icon;
                return (
                  <MotionDiv key={index} delay={index * 100}>
                    <Card className="group h-full bg-card border-border hover:border-primary/50 hover:bg-primary/5 transition-all duration-300">
                      <CardContent className="p-6">
                        <div className="mb-4 p-3 bg-primary/10 rounded-lg w-fit group-hover:bg-primary/20 transition-colors">
                          <Icon className="h-6 w-6 text-primary" />
                        </div>
                        <h3 className="text-lg font-bold text-foreground mb-2">{feature.title}</h3>
                        <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
                      </CardContent>
                    </Card>
                  </MotionDiv>
                );
              })}
            </div>
          </div>
        </section>

        {/* Benefits Section */}
        <section id="benefits" className="py-24 sm:py-32">
            <div className="container mx-auto px-6">
                <div className="grid lg:grid-cols-2 gap-16 items-center">
                    <div className="relative">
                        <MotionDiv>
                           <AnimatedChartDisplay />
                        </MotionDiv>
                    </div>
                    <div>
                        <MotionDiv>
                            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-6">
                                Make Better, Faster Decisions
                            </h2>
                            <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
                                Our platform transforms noisy alarm data into clear health metrics, prioritizing the sources that demand your attention most.
                            </p>
                            <div className="space-y-4">
                                {benefits.map((benefit, index) => (
                                    <div key={index} className="flex items-start gap-3">
                                        <CheckCircle className="h-5 w-5 text-primary flex-shrink-0 mt-1" />
                                        <span className="text-foreground">{benefit}</span>
                                    </div>
                                ))}
                            </div>
                        </MotionDiv>
                    </div>
                </div>
            </div>
        </section>

        {/* CTA Section */}
        <section className="py-24 sm:py-32">
            <div className="container mx-auto px-6">
                <MotionDiv>
                    <div className="relative rounded-2xl p-10 md:p-16 text-center bg-gradient-to-br from-[#017944] via-[#067e52] to-[#599133] overflow-hidden">
                        <div className="absolute inset-0 bg-grid-pattern opacity-10"></div>
                        <div className="relative z-10">
                            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Ready to Optimize Your Operations?</h2>
                            <p className="text-lg text-white/90 max-w-2xl mx-auto mb-8">
                                Start with PVC-I today. Bring real-time alarm health, powerful visuals, and faster decisions to your entire team.
                            </p>
                            <Button size="lg" asChild className="bg-slate-200 hover:bg-slate-100 text-[#017944] font-bold text-lg px-8 py-6 transition-transform hover:scale-105">
                                <a href="/dashboard">
                                    Access the Live Dashboard
                                    <ArrowRight className="ml-2 h-5 w-5" />
                                </a>
                            </Button>
                        </div>
                    </div>
                </MotionDiv>
            </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-background/50">
        <div className="container mx-auto px-6 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between text-center md:text-left">
            <div className="flex items-center gap-3 mb-4 md:mb-0">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <p className="font-semibold text-foreground">Alarm Health Monitoring Platform</p>
            </div>
            <div className="text-sm text-muted-foreground">
              <p>© {new Date().getFullYear()} Engro Digital. All rights reserved.</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;