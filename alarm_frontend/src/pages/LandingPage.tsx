import { useState } from 'react';
import { ArrowRight, ShieldCheck, BarChart3, CheckCircle, TrendingUp, AlertTriangle, Activity, Sparkles, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Header } from '@/components/shared/Header';
import { Footer } from '@/components/shared/Footer';
import PixelBlast from '@/components/ui/PixelBlast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { usePlantHealth } from '@/hooks/usePlantHealth';
import { UnhealthyBarChart } from '@/components/dashboard/UnhealthyBarChart';
import AnimatedChartDisplay from '@/components/landing/AnimatedChartDisplay';
import { GridBackground } from '@/components/landing/GridBackground';
import { GradientOrb } from '@/components/landing/GradientOrb';
import { AnimatedCounter } from '@/components/landing/AnimatedCounter';
import { DashboardMockup } from '@/components/landing/DashboardMockup';
import { BentoGrid, BentoCard } from '@/components/landing/BentoGrid';
import { FeatureCard } from '@/components/landing/FeatureCard';
import { ScrollIndicator } from '@/components/landing/ScrollIndicator';

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
  const { data, isLoading } = usePlantHealth('pvcI', topN, 'perSource', 60000);
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

  const navLinks = [
    {
      label: 'Features',
      href: '#features',
      onClick: (e: React.MouseEvent) => {
        e.preventDefault();
        document.querySelector('#features')?.scrollIntoView({ behavior: 'smooth' });
      }
    },
    {
      label: 'Live Snapshot',
      href: '#snapshot',
      onClick: (e: React.MouseEvent) => {
        e.preventDefault();
        document.querySelector('#snapshot')?.scrollIntoView({ behavior: 'smooth' });
      }
    },
    {
      label: 'Benefits',
      href: '#benefits',
      onClick: (e: React.MouseEvent) => {
        e.preventDefault();
        document.querySelector('#benefits')?.scrollIntoView({ behavior: 'smooth' });
      }
    }
  ];

  return (
    <div className="min-h-screen bg-background text-foreground font-sans scroll-smooth selection:bg-lime-accent/20">
      <Header
        variant="landing"
        navLinks={navLinks}
      />

      <main className="relative">
        {/* ===== HERO SECTION ===== */}
        <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
          {/* Sophisticated Background */}
          <div className="absolute inset-0 z-0">
            {/* Grid Background */}
            <GridBackground gridSize={60} gridColor="var(--landing-grid-hero)" />

            {/* Animated Gradient Orbs */}
            <GradientOrb
              size="xl"
              color="green"
              className="top-1/4 left-1/4"
            />
            <GradientOrb
              size="lg"
              color="green"
              className="bottom-1/3 right-1/4"
              animated={true}
            />

            {/* Subtle PixelBlast Effect */}
            <PixelBlast
              className="absolute inset-0 opacity-30"
              variant="circle"
              pixelSize={4}
              color="#a3e635"
              patternScale={4}
              patternDensity={0.8}
              speed={0.3}
              transparent
              noiseAmount={0.03}
            />

            {/* Vignette for focus */}
            <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/20 to-background/80" />
          </div>

          {/* Hero Content */}
          <div className="container mx-auto px-6 relative z-10 py-32">
            <div className="flex flex-col items-center text-center max-w-6xl mx-auto">

              {/* Badge */}
              <MotionDiv>
                <Badge
                  variant="outline"
                  className="mb-8 border-lime-accent/30 bg-lime-accent/5 text-lime-accent py-2 px-5 backdrop-blur-sm text-sm font-medium"
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  Standards-Aligned Alarm Health Monitoring
                </Badge>
              </MotionDiv>

              {/* Massive Headline - Perfectly Centered */}
              <MotionDiv delay={150}>
                <h1 className="text-5xl md:text-7xl lg:text-8xl font-black text-foreground mb-8 leading-[1.1] tracking-tight">
                  Transform Alarm Data
                  <br />
                  into{' '}
                  <span className="text-lime-accent">Actionable</span>
                  {' '}Intelligence
                </h1>
              </MotionDiv>

              {/* Subtitle - Concise & Clear */}
              <MotionDiv delay={300}>
                <p className="text-xl md:text-2xl text-muted-foreground mb-12 max-w-3xl leading-relaxed">
                  Monitor alarm performance in real-time. Quantify source health, surface hotspots,
                  and act with confidence—starting with the{' '}
                  <span className="text-lime-accent font-semibold">PVC-I production line</span>.
                </p>
              </MotionDiv>

              {/* CTA Buttons with Clear Hierarchy */}
              <MotionDiv delay={450}>
                <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
                  <Button
                    size="lg"
                    asChild
                    className="bg-lime-accent hover:bg-lime-accent/90 text-black font-bold text-lg px-10 py-7 transition-all hover:scale-105 hover:shadow-xl hover:shadow-lime-accent/30"
                  >
                    <a href="/dashboard">
                      View Live Dashboard <ArrowRight className="ml-2 h-5 w-5" />
                    </a>
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    asChild
                    className="border-border/40 text-foreground bg-background/50 hover:bg-accent/60 backdrop-blur-sm text-lg px-10 py-7"
                  >
                    <a href="#features">Learn More</a>
                  </Button>
                </div>
              </MotionDiv>

              {/* Dashboard Mockups - Both Variants */}
              <MotionDiv delay={600}>
                <div className="w-full space-y-8">
                  {/* Browser Frame Mockup */}
                  <DashboardMockup variant="browser">
                    <div className="grid grid-cols-4 gap-4">
                      <Card className="col-span-4 md:col-span-2 bg-card/50 border-lime-accent/20">
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-base">Overall Health</CardTitle>
                            <TrendingUp className="h-4 w-4 text-lime-accent" />
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="text-4xl font-bold text-lime-accent">
                            <AnimatedCounter value={93.8} decimals={1} suffix="%" />
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">System performing optimally</p>
                        </CardContent>
                      </Card>
                      <Card className="col-span-2 md:col-span-1 bg-card/50 border-primary/20">
                        <CardContent className="pt-6 text-center">
                          <div className="text-3xl font-bold text-foreground">
                            <AnimatedCounter value={26740} />
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">Active Sources</p>
                        </CardContent>
                      </Card>
                      <Card className="col-span-2 md:col-span-1 bg-card/50 border-primary/20">
                        <CardContent className="pt-6 text-center">
                          <div className="text-3xl font-bold text-foreground">
                            <AnimatedCounter value={76} />
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">Data Files</p>
                        </CardContent>
                      </Card>
                    </div>
                  </DashboardMockup>
                </div>
              </MotionDiv>

              {/* Scroll Indicator */}
              <MotionDiv delay={750}>
                <div className="mt-20">
                  <ScrollIndicator targetId="snapshot" />
                </div>
              </MotionDiv>
            </div>
          </div>
        </section>

        {/* ===== LIVE SNAPSHOT SECTION ===== */}
        <section id="snapshot" className="py-32 relative">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-muted/20 to-transparent" />
          <div className="container mx-auto px-6 relative z-10">
            <MotionDiv>
              <div className="text-center mb-20">
                <Badge className="mb-4 bg-primary/10 text-primary border-primary/20">Live Data</Badge>
                <h2 className="text-4xl md:text-5xl font-black text-foreground mb-4">
                  Live Plant Snapshot: <span className="text-lime-accent">PVC-I</span>
                </h2>
                <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
                  Real-time overview of alarm system health and top offenders
                </p>
                <p className="text-sm text-muted-foreground/70 mt-3">
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

                {/* Stats Cards */}
                <div className="space-y-6">
                  <Card className="bg-card/50 backdrop-blur-sm border-lime-accent/20 hover:border-lime-accent/40 transition-all hover:-translate-y-1">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lime-accent">
                        <TrendingUp className="h-5 w-5" />
                        Overall Health
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 gap-4 text-center">
                      <div>
                        <p className="text-4xl font-bold text-lime-accent">
                          {isLoading ? '—' : `${(metrics?.healthy_percentage ?? 0).toFixed(1)}%`}
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">Healthy</p>
                      </div>
                      <div>
                        <p className="text-4xl font-bold text-primary">
                          {isLoading ? '—' : `${(metrics?.unhealthy_percentage ?? 0).toFixed(1)}%`}
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">Unhealthy</p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-card/50 backdrop-blur-sm border-border/40 hover:border-primary/40 transition-all hover:-translate-y-1">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-muted-foreground">
                        <Activity className="h-5 w-5" />
                        System Load
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 gap-4 text-center">
                      <div>
                        <p className="text-3xl font-bold text-foreground">
                          {isLoading ? '—' : metrics?.total_sources?.toLocaleString() ?? '—'}
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">Sources</p>
                      </div>
                      <div>
                        <p className="text-3xl font-bold text-foreground">
                          {isLoading ? '—' : metrics?.total_files?.toLocaleString() ?? '—'}
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">Data Files</p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </MotionDiv>


          </div>
        </section>

        {/* ===== FEATURES SECTION - BENTO GRID ===== */}
        <section id="features" className="py-32 relative overflow-hidden">
          {/* Background */}
          <div className="absolute inset-0">
            <div className="absolute inset-0 bg-muted/30" />
            <GridBackground gridSize={80} gridColor="var(--landing-grid-features)" fadeEdges={true} />
          </div>

          <div className="container mx-auto px-6 relative z-10">
            <div className="text-center mb-20 max-w-4xl mx-auto">
              <Badge className="mb-4 bg-lime-accent/10 text-lime-accent border-lime-accent/20">
                Four-Step Process
              </Badge>
              <h2 className="text-4xl md:text-5xl font-black text-foreground mb-4">
                From Raw Data to <span className="text-lime-accent">Clarity</span>
              </h2>
              <p className="text-xl text-muted-foreground">
                Every stage is designed for clarity, speed, and compliance
              </p>
            </div>

            {/* Bento Grid Layout */}
            <BentoGrid className="mb-12">
              <BentoCard
                span="wide"
                icon={<Activity className="h-6 w-6 text-lime-accent" />}
                title="Real-Time Data Ingestion"
                description="Stream and normalize alarm events instantly"
                gradient
              >
                <div className="w-full h-full flex items-center justify-center">
                  <div className="grid grid-cols-3 gap-2 w-full max-w-xs">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                      <div
                        key={i}
                        className="h-12 bg-lime-accent/20 rounded-lg animate-pulse"
                        style={{ animationDelay: `${i * 100}ms` }}
                      />
                    ))}
                  </div>
                </div>
              </BentoCard>

              <BentoCard
                icon={<ShieldCheck className="h-6 w-6 text-primary" />}
                title="Automated Health Scoring"
                description="Rolling health scores per source"
                gradient
              >
                <div className="text-5xl font-black text-lime-accent">
                  <AnimatedCounter value={94.2} decimals={1} suffix="%" />
                </div>
              </BentoCard>

              <BentoCard
                icon={<AlertTriangle className="h-6 w-6 text-yellow-500" />}
                title="Anomaly Detection"
                description="Surface issues instantly"
                gradient
              >
                <div className="flex items-center gap-2">
                  <Bell className="h-8 w-8 text-yellow-500 animate-bounce" />
                  <span className="text-2xl font-bold">3 Alerts</span>
                </div>
              </BentoCard>

              <BentoCard
                span="wide"
                icon={<BarChart3 className="h-6 w-6 text-primary" />}
                title="Actionable Insights"
                description="Prioritize and track improvements"
                gradient
              >
                <div className="w-full h-full flex items-end justify-between gap-2 px-8">
                  {[40, 70, 45, 90, 60, 80].map((height, i) => (
                    <div
                      key={i}
                      className="flex-1 bg-gradient-to-t from-lime-accent to-primary rounded-t-lg transition-all hover:scale-105"
                      style={{ height: `${height}%` }}
                    />
                  ))}
                </div>
              </BentoCard>
            </BentoGrid>

            {/* Enhanced Feature Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-12">
              {features.map((feature, index) => (
                <MotionDiv key={index} delay={index * 100}>
                  <FeatureCard
                    icon={feature.icon}
                    title={feature.title}
                    description={feature.description}
                    iconColor="text-lime-accent"
                  />
                </MotionDiv>
              ))}
            </div>
          </div>
        </section>

        {/* ===== BENEFITS SECTION ===== */}
        <section id="benefits" className="py-32 relative">
          <div className="container mx-auto px-6">
            <div className="grid lg:grid-cols-2 gap-20 items-center">
              {/* Left: Animated Chart */}
              <div className="relative">
                <MotionDiv>
                  <div className="relative">
                    {/* Decorative glow */}
                    <GradientOrb size="md" className="top-0 left-0" />
                    <AnimatedChartDisplay />
                  </div>
                </MotionDiv>
              </div>

              {/* Right: Benefits List */}
              <div>
                <MotionDiv>
                  <Badge className="mb-4 bg-primary/10 text-primary border-primary/20">
                    Benefits
                  </Badge>
                  <h2 className="text-4xl md:text-5xl font-black text-foreground mb-6">
                    Make Better, <span className="text-lime-accent">Faster</span> Decisions
                  </h2>
                  <p className="text-xl text-muted-foreground mb-10 leading-relaxed">
                    Transform noisy alarm data into clear health metrics,
                    prioritizing sources that demand attention most.
                  </p>
                  <div className="space-y-5">
                    {benefits.map((benefit, index) => (
                      <MotionDiv key={index} delay={index * 50}>
                        <div className="flex items-start gap-4 group">
                          <div className="p-1.5 bg-lime-accent/10 rounded-lg group-hover:bg-lime-accent/20 transition-colors">
                            <CheckCircle className="h-5 w-5 text-lime-accent flex-shrink-0" />
                          </div>
                          <span className="text-foreground text-lg leading-relaxed">
                            {benefit}
                          </span>
                        </div>
                      </MotionDiv>
                    ))}
                  </div>
                </MotionDiv>
              </div>
            </div>
          </div>
        </section>

        {/* ===== CTA SECTION ===== */}
        <section className="py-32 relative overflow-hidden">
          {/* Background */}
          <div className="absolute inset-0">
            <GridBackground gridSize={40} gridColor="var(--landing-grid-cta)" fadeEdges={false} />
            <div className="absolute inset-0 bg-gradient-to-br from-background via-lime-accent/5 to-background" />
          </div>

          <div className="container mx-auto px-6 relative z-10">
            <MotionDiv>
              <div className="relative rounded-3xl p-12 md:p-20 text-center overflow-hidden border-2 border-lime-accent/20 bg-card/30 backdrop-blur-xl">
                {/* Decorative elements */}
                <GradientOrb size="lg" className="top-0 right-0" />

                <div className="relative z-10">
                  <h2 className="text-4xl md:text-5xl font-black text-foreground mb-6">
                    Ready to <span className="text-lime-accent">Optimize</span> Your Operations?
                  </h2>
                  <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
                    Start with PVC-I today. Bring real-time alarm health, powerful visuals,
                    and faster decisions to your entire team.
                  </p>
                  <Button
                    size="lg"
                    asChild
                    className="bg-lime-accent hover:bg-lime-accent/90 text-black font-bold text-lg px-12 py-7 transition-all hover:scale-105 hover:shadow-2xl hover:shadow-lime-accent/40"
                  >
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

      {/* ===== FOOTER ===== */}
      <Footer />
    </div>
  );
};

export default LandingPage;