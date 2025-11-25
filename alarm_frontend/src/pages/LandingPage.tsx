import { ArrowRight, ShieldCheck, BarChart3, CheckCircle, TrendingUp, AlertTriangle, Activity, Sparkles, Bell, Cpu, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Header } from '@/components/shared/Header';
import { Footer } from '@/components/shared/Footer';
import PixelBlast from '@/components/ui/PixelBlast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import AnimatedChartDisplay from '@/components/landing/AnimatedChartDisplay';
import { GridBackground } from '@/components/landing/GridBackground';
import { GradientOrb } from '@/components/landing/GradientOrb';
import { AnimatedCounter } from '@/components/landing/AnimatedCounter';
import { DashboardMockup } from '@/components/landing/DashboardMockup';
import { BentoGrid, BentoCard } from '@/components/landing/BentoGrid';
import { FeatureCard } from '@/components/landing/FeatureCard';
import { ScrollIndicator } from '@/components/landing/ScrollIndicator';
import { ProcessFlowCard } from '@/components/landing/ProcessFlowCard';
import { FlowArrow } from '@/components/landing/FlowArrow';
import { StatsTicker } from '@/components/landing/StatsTicker';

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
      label: 'How It Works',
      href: '#how-it-works',
      onClick: (e: React.MouseEvent) => {
        e.preventDefault();
        document.querySelector('#how-it-works')?.scrollIntoView({ behavior: 'smooth' });
      }
    },
    {
      label: 'Features',
      href: '#features',
      onClick: (e: React.MouseEvent) => {
        e.preventDefault();
        document.querySelector('#features')?.scrollIntoView({ behavior: 'smooth' });
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

              {/* Dashboard Mockup - Feature Showcase */}
              <MotionDiv delay={600}>
                <div className="w-full space-y-8">
                  {/* Browser Frame Mockup */}
                  <DashboardMockup variant="browser">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Feature 1: Real-Time Monitoring */}
                      <Card className="bg-card/50 border-lime-accent/20 hover:border-lime-accent/40 transition-all group">
                        <CardContent className="pt-6">
                          <div className="flex items-start gap-3">
                            <div className="p-2 bg-lime-accent/10 rounded-lg group-hover:bg-lime-accent/20 transition-colors">
                              <Activity className="h-5 w-5 text-lime-accent" />
                            </div>
                            <div className="flex-1">
                              <h3 className="font-semibold text-sm mb-1">Real-Time Monitoring</h3>
                              <p className="text-xs text-muted-foreground leading-relaxed">
                                Continuous alarm tracking across all production lines
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Feature 2: Smart Analytics */}
                      <Card className="bg-card/50 border-lime-accent/20 hover:border-lime-accent/40 transition-all group">
                        <CardContent className="pt-6">
                          <div className="flex items-start gap-3">
                            <div className="p-2 bg-lime-accent/10 rounded-lg group-hover:bg-lime-accent/20 transition-colors">
                              <BarChart3 className="h-5 w-5 text-lime-accent" />
                            </div>
                            <div className="flex-1">
                              <h3 className="font-semibold text-sm mb-1">Smart Analytics</h3>
                              <p className="text-xs text-muted-foreground leading-relaxed">
                                Advanced algorithms identify patterns and anomalies
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Feature 3: Instant Alerts */}
                      <Card className="bg-card/50 border-lime-accent/20 hover:border-lime-accent/40 transition-all group">
                        <CardContent className="pt-6">
                          <div className="flex items-start gap-3">
                            <div className="p-2 bg-lime-accent/10 rounded-lg group-hover:bg-lime-accent/20 transition-colors">
                              <Bell className="h-5 w-5 text-lime-accent" />
                            </div>
                            <div className="flex-1">
                              <h3 className="font-semibold text-sm mb-1">Instant Alerts</h3>
                              <p className="text-xs text-muted-foreground leading-relaxed">
                                Get notified immediately when issues are detected
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Feature 4: Health Scoring */}
                      <Card className="bg-card/50 border-lime-accent/20 hover:border-lime-accent/40 transition-all group">
                        <CardContent className="pt-6">
                          <div className="flex items-start gap-3">
                            <div className="p-2 bg-lime-accent/10 rounded-lg group-hover:bg-lime-accent/20 transition-colors">
                              <ShieldCheck className="h-5 w-5 text-lime-accent" />
                            </div>
                            <div className="flex-1">
                              <h3 className="font-semibold text-sm mb-1">Health Scoring</h3>
                              <p className="text-xs text-muted-foreground leading-relaxed">
                                Automated health metrics for every alarm source
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Feature 5: Compliance Ready */}
                      <Card className="bg-card/50 border-lime-accent/20 hover:border-lime-accent/40 transition-all group">
                        <CardContent className="pt-6">
                          <div className="flex items-start gap-3">
                            <div className="p-2 bg-lime-accent/10 rounded-lg group-hover:bg-lime-accent/20 transition-colors">
                              <CheckCircle className="h-5 w-5 text-lime-accent" />
                            </div>
                            <div className="flex-1">
                              <h3 className="font-semibold text-sm mb-1">Compliance Ready</h3>
                              <p className="text-xs text-muted-foreground leading-relaxed">
                                Meets industry standards and best practices
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Feature 6: Visual Insights */}
                      <Card className="bg-card/50 border-lime-accent/20 hover:border-lime-accent/40 transition-all group">
                        <CardContent className="pt-6">
                          <div className="flex items-start gap-3">
                            <div className="p-2 bg-lime-accent/10 rounded-lg group-hover:bg-lime-accent/20 transition-colors">
                              <TrendingUp className="h-5 w-5 text-lime-accent" />
                            </div>
                            <div className="flex-1">
                              <h3 className="font-semibold text-sm mb-1">Visual Insights</h3>
                              <p className="text-xs text-muted-foreground leading-relaxed">
                                Clear charts and graphs for quick decision-making
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </DashboardMockup>
                </div>
              </MotionDiv>

              {/* Scroll Indicator */}
              <MotionDiv delay={750}>
                <div className="mt-20">
                  <ScrollIndicator targetId="how-it-works" />
                </div>
              </MotionDiv>
            </div>
          </div>
        </section>

        {/* ===== HOW IT WORKS - SYSTEM INTELLIGENCE PIPELINE ===== */}
        <section id="how-it-works" className="py-32 relative overflow-hidden">
          {/* Background */}
          <div className="absolute inset-0">
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-muted/20 to-transparent" />
            <GridBackground gridSize={60} gridColor="var(--landing-grid-features)" fadeEdges={true} />
          </div>

          <div className="container mx-auto px-6 relative z-10">
            {/* Section Header */}
            <MotionDiv>
              <div className="text-center mb-16">
                <Badge className="mb-4 bg-lime-accent/10 text-lime-accent border-lime-accent/20">
                  How It Works
                </Badge>
                <h2 className="text-4xl md:text-5xl font-black text-foreground mb-4">
                  From Raw Data to Actionable Intelligence
                </h2>
                <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
                  See how our system transforms alarm chaos into crystal-clear insights in milliseconds
                </p>
              </div>
            </MotionDiv>

            {/* Process Flow Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-16">
              {/* Card 1: Data Ingestion */}
              <div className="lg:col-span-1">
                <ProcessFlowCard
                  icon={Activity}
                  title="Data Ingestion"
                  description="Continuously collect alarm events from multiple sources across your production line"
                  step={1}
                  delay={0}
                  visualElement={
                    <div className="flex gap-1 justify-center">
                      {[1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className="h-2 w-2 bg-lime-accent rounded-full animate-pulse"
                          style={{ animationDelay: `${i * 200}ms` }}
                        />
                      ))}
                    </div>
                  }
                />
              </div>

              {/* Arrow 1 */}
              <FlowArrow className="hidden lg:flex lg:col-span-0" />

              {/* Card 2: Smart Processing */}
              <div className="lg:col-span-1">
                <ProcessFlowCard
                  icon={Cpu}
                  title="Smart Processing"
                  description="Normalize and analyze thousands of events per second with advanced algorithms"
                  step={2}
                  delay={150}
                  visualElement={
                    <div className="flex items-center justify-center gap-2">
                      <Zap className="h-4 w-4 text-lime-accent animate-pulse" />
                      <span className="text-xs text-muted-foreground">Processing...</span>
                    </div>
                  }
                />
              </div>

              {/* Arrow 2 */}
              <FlowArrow className="hidden lg:flex lg:col-span-0" />

              {/* Card 3: Health Scoring */}
              <div className="lg:col-span-1">
                <ProcessFlowCard
                  icon={ShieldCheck}
                  title="Health Scoring"
                  description="Calculate real-time health metrics for every alarm source against industry standards"
                  step={3}
                  delay={300}
                  visualElement={
                    <div className="text-center">
                      <div className="text-2xl font-bold text-lime-accent">
                        <AnimatedCounter value={94} suffix="%" />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Health Score</p>
                    </div>
                  }
                />
              </div>

              {/* Arrow 3 */}
              <FlowArrow className="hidden lg:flex lg:col-span-0" />

              {/* Card 4: Anomaly Detection */}
              <div className="lg:col-span-1">
                <ProcessFlowCard
                  icon={AlertTriangle}
                  title="Anomaly Detection"
                  description="Identify unhealthy sources and critical patterns before they become problems"
                  step={4}
                  delay={450}
                  visualElement={
                    <div className="flex items-center justify-center gap-2">
                      <Bell className="h-5 w-5 text-yellow-500 animate-bounce" />
                      <span className="text-xs font-semibold">Alert Triggered</span>
                    </div>
                  }
                />
              </div>

              {/* Arrow 4 */}
              <FlowArrow className="hidden lg:flex lg:col-span-0" />

              {/* Card 5: Dashboard Intelligence */}
              <div className="lg:col-span-1">
                <ProcessFlowCard
                  icon={BarChart3}
                  title="Dashboard Intelligence"
                  description="Transform complex data into clear visualizations and actionable recommendations"
                  step={5}
                  delay={600}
                  visualElement={
                    <div className="flex items-end justify-between gap-1 h-12">
                      {[40, 70, 45, 90, 60].map((height, i) => (
                        <div
                          key={i}
                          className="flex-1 bg-gradient-to-t from-lime-accent to-lime-accent/50 rounded-t transition-all hover:scale-105"
                          style={{ height: `${height}%` }}
                        />
                      ))}
                    </div>
                  }
                />
              </div>
            </div>

            {/* Stats Ticker */}
            <MotionDiv delay={750}>
              <StatsTicker />
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