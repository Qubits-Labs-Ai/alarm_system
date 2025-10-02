import { useState, useEffect } from 'react';
import { ArrowRight, ArrowDown, Shield, BarChart3, CheckCircle, TrendingUp, AlertTriangle, Activity, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import GridSmallBackgroundDemo from '@/components/ui/grid-small-background-demo';
import { usePlantHealth } from '@/hooks/usePlantHealth';
import { UnhealthyBarChart } from '@/components/dashboard/UnhealthyBarChart';
import engroLogo from '@/assets/engro-logo.png';

const LandingPage = () => {
  const [currentStat, setCurrentStat] = useState(0);
  const [topN, setTopN] = useState<1 | 3>(1);

  const { data, isLoading } = usePlantHealth('pvcI', topN, 60000);
  const metrics = data?.metrics;
  
  // Animated statistics
  const stats = [
    { label: 'Healthy Sources', value: `${(metrics?.healthy_percentage ?? 0).toFixed(1)}%`, icon: TrendingUp, color: 'text-emerald-600' },
    { label: 'Total Sources', value: metrics?.total_sources ? metrics.total_sources.toLocaleString() : '—', icon: Activity, color: 'text-blue-600' },
    { label: 'Unhealthy %', value: `${(metrics?.unhealthy_percentage ?? 0).toFixed(1)}%`, icon: AlertTriangle, color: 'text-amber-600' },
    { label: 'Data Files', value: metrics?.total_files ? metrics.total_files.toLocaleString() : '—', icon: BarChart3, color: 'text-purple-600' }
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentStat((prev) => (prev + 1) % stats.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const features = [
    {
      icon: Activity,
      title: 'Data Ingestion',
      description: 'Alarm events and source histories are continuously streamed and normalized for analysis.',
      highlight: 'Live'
    },
    {
      icon: Shield,
      title: 'Health Scoring',
      description: 'Each source receives a rolling health score based on flood counts against a defined threshold.',
      highlight: 'Standards-Aligned'
    },
    {
      icon: AlertTriangle,
      title: 'Anomaly Detection',
      description: 'Unhealthy sources and peak windows are surfaced instantly for action.',
      highlight: 'Real-Time'
    },
    {
      icon: BarChart3,
      title: 'Insight & Action',
      description: 'Interactive charts and summaries help prioritize remediation and track improvement.',
      highlight: 'Interactive'
    }
  ];

  const benefits = [
    'Reduce nuisance alarms and operator load',
    'Shorten time-to-diagnosis with clear hotspots',
    'Track progress with objective health metrics',
    'Improve alarm performance compliance',
    'Enable proactive maintenance with trend signals',
    'Seamless handoff to the live dashboard'
  ];

  // Predefine icons for bento tiles to avoid dynamic JSX like <features[i].icon />
  const Icon0 = features[0].icon;
  const Icon1 = features[1].icon;
  const Icon2 = features[2].icon;
  const Icon3 = features[3].icon;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 scroll-smooth">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/70 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src={engroLogo} alt="Logo" className="h-8 w-auto" />
              <div className="border-l border-border pl-3 flex items-center gap-2">
                {/* <Shield className="h-5 w-5 text-primary" /> */}
                <div>
                  <h1 className="text-lg font-bold text-foreground">Standard-Aligned Alarm Management System</h1>
                  <p className="text-xs text-muted-foreground">Real-time monitoring & analytics</p>
                </div>
              </div>
            </div>
            <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
              <a href="#snapshot" className="hover:text-foreground">Snapshot</a>
              <a href="#features" className="hover:text-foreground">Features</a>
              <a href="#value" className="hover:text-foreground">Benefits</a>
              <a href="#cta" className="hover:text-foreground">Contact</a>
            </nav>
            <Button asChild>
              <a href="/signin">Access Dashboard</a>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative py-24 lg:py-32 overflow-hidden min-h-[70vh]">
        {/* Layered professional background */}
        <div className="absolute inset-0 z-0 pointer-events-none">
          <div className="absolute inset-0 opacity-80">
            <GridSmallBackgroundDemo />
          </div>
          {/* Spotlight gradient using CSS variable color */}
          <div className="absolute inset-0 bg-[radial-gradient(1200px_400px_at_50%_-10%,hsl(var(--primary)/0.2),transparent_60%)]" />
          </div>
        <div className="container mx-auto px-6 relative z-10">
          <div className="max-w-4xl mx-auto text-center">
            <Badge variant="secondary" className="mb-6 px-4 py-2 text-sm font-medium motion-safe:animate-fade-up inline-flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Standards-Aligned Alarm Health Monitoring
            </Badge>
            
            <h1 className="text-5xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-foreground via-primary to-secondary bg-clip-text text-transparent leading-tight motion-safe:animate-fade-up">
              AI‑Powered Alarm Management System
            </h1>
            
            <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto leading-relaxed motion-safe:animate-fade-up">
              Monitor alarm performance in real time. Quantify source health, surface hotspots, and act with confidence—starting with the PVC‑I production line.
            </p>
            
            <div className="mb-8">
              <Badge variant="outline" className="px-4 py-2 text-sm font-medium border-primary/30 text-primary relative overflow-hidden bg-gradient-to-r from-transparent via-foreground/5 to-transparent bg-[length:200%_100%] motion-safe:animate-shimmer">
                PVC‑I • Healthy {(metrics?.healthy_percentage ?? 0).toFixed(1)}% • Updated {metrics?.last_updated ? new Date(metrics.last_updated).toLocaleString() : '—'}
              </Badge>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12 motion-safe:animate-fade-up">
              <Button size="lg" className="px-8 py-3 text-lg" asChild>
                <a href="/dashboard">
                  View Live Dashboard
                  <ArrowRight className="ml-2 h-5 w-5" />
                </a>
              </Button>
              <Button size="lg" variant="outline" className="px-8 py-3 text-lg" asChild>
                <a href="#features">Learn More</a>
              </Button>
            </div>

            {/* Animated Statistics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto">
              {stats.map((stat, index) => (
                <Card 
                  key={index}
                  className={`transition-all duration-500 motion-safe:animate-fade-up ${
                    currentStat === index 
                      ? 'ring-2 ring-primary/60 shadow-lg scale-105' 
                      : 'hover:shadow-md hover:translate-y-0.5'
                  }`}
                  style={{ animationDelay: `${index * 120}ms` }}
                >
                  <CardContent className="p-6 text-center">
                    <stat.icon className={`h-8 w-8 mx-auto mb-3 motion-safe:animate-float ${stat.color}`} />
                    <div className="text-2xl font-bold text-foreground mb-1">
                      {isLoading ? '—' : stat.value}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {stat.label}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Scroll cue */}
            <div className="mt-12">
              <a href="#features" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <ArrowDown className="h-4 w-4 animate-bounce" />
                Scroll to explore
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Live Snapshot */}
      <section id="snapshot" className="py-24">
        <div className="container mx-auto px-6">
          <div className="grid lg:grid-cols-3 gap-8 items-stretch">
            <div className="lg:col-span-2 space-y-8">
              <UnhealthyBarChart 
                data={data?.unhealthyBars ?? []}
                threshold={10}
                topN={topN}
                onTopNChange={setTopN}
                isLoading={isLoading}
              />
            </div>
            <div>
              <Card className="p-6 h-full bg-gradient-to-br from-primary/5 to-secondary/5 border-primary/20">
                <CardContent className="p-0">
                  <div className="text-center mb-6">
                    <Shield className="h-12 w-12 text-primary mx-auto mb-2" />
                    <h3 className="text-2xl font-bold text-foreground mb-1">PVC‑I Live Status</h3>
                    <p className="text-muted-foreground">Current production line health</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-4 bg-background/50 rounded-lg">
                      <div className="text-2xl font-bold text-emerald-600">{isLoading ? '—' : `${(metrics?.healthy_percentage ?? 0).toFixed(1)}%`}</div>
                      <div className="text-sm text-muted-foreground">Healthy</div>
                    </div>
                    <div className="text-center p-4 bg-background/50 rounded-lg">
                      <div className="text-2xl font-bold text-amber-600">{isLoading ? '—' : `${(metrics?.unhealthy_percentage ?? 0).toFixed(1)}%`}</div>
                      <div className="text-sm text-muted-foreground">Unhealthy</div>
                    </div>
                    <div className="text-center p-4 bg-background/50 rounded-lg">
                      <div className="text-2xl font-bold text-foreground">{isLoading ? '—' : metrics?.total_sources?.toLocaleString() ?? '—'}</div>
                      <div className="text-sm text-muted-foreground">Sources</div>
                    </div>
                    <div className="text-center p-4 bg-background/50 rounded-lg">
                      <div className="text-2xl font-bold text-foreground">{isLoading ? '—' : metrics?.total_files?.toLocaleString() ?? '—'}</div>
                      <div className="text-sm text-muted-foreground">Data Files</div>
                    </div>
                  </div>
                  <Button className="w-full mt-6" asChild>
                    <a href="/dashboard">
                      Open Live Dashboard
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </a>
                  </Button>
                  <p className="text-xs text-muted-foreground mt-3 text-center">
                    Last updated {metrics?.last_updated ? new Date(metrics.last_updated).toLocaleString() : '—'}
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="features" className="py-24 bg-muted/30">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4 text-foreground">
              How the Alarm Health System Works
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              From raw alarm events to actionable insights—every stage is designed for clarity and speed.
            </p>
          </div>

          {/* Bento-style grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-6">
            {/* Data Ingestion */}
            <Card className="lg:col-span-2 group border-0 bg-background/60 backdrop-blur-sm hover:shadow-lg transition-all duration-300 motion-safe:animate-fade-up">
              <CardContent className="p-8">
                <div className="flex items-center justify-between mb-4">
                  <Icon0 className="h-12 w-12 text-primary group-hover:scale-110 transition-transform duration-300" />
                  <Badge variant="secondary" className="text-xs">{features[0].highlight}</Badge>
                </div>
                <h3 className="text-xl font-semibold mb-3 text-foreground">{features[0].title}</h3>
                <p className="text-muted-foreground leading-relaxed">{features[0].description}</p>
              </CardContent>
            </Card>

            {/* Health Scoring */}
            <Card className="lg:col-span-2 group border-0 bg-background/60 backdrop-blur-sm hover:shadow-lg transition-all duration-300 motion-safe:animate-fade-up" style={{ animationDelay: '100ms' }}>
              <CardContent className="p-8">
                <div className="flex items-center justify-between mb-4">
                  <Icon1 className="h-12 w-12 text-primary group-hover:scale-110 transition-transform duration-300" />
                  <Badge variant="secondary" className="text-xs">{features[1].highlight}</Badge>
                </div>
                <h3 className="text-xl font-semibold mb-3 text-foreground">{features[1].title}</h3>
                <p className="text-muted-foreground leading-relaxed">{features[1].description}</p>
              </CardContent>
            </Card>

            {/* Anomaly Detection - wide card */}
            <Card className="lg:col-span-4 group border-0 bg-background/60 backdrop-blur-sm hover:shadow-lg transition-all duration-300 motion-safe:animate-fade-up" style={{ animationDelay: '200ms' }}>
              <CardContent className="p-8">
                <div className="flex items-center justify-between mb-4">
                  <Icon2 className="h-12 w-12 text-primary group-hover:scale-110 transition-transform duration-300" />
                  <Badge variant="secondary" className="text-xs">{features[2].highlight}</Badge>
                </div>
                <h3 className="text-xl font-semibold mb-3 text-foreground">{features[2].title}</h3>
                <p className="text-muted-foreground leading-relaxed">{features[2].description}</p>
              </CardContent>
            </Card>

            {/* Insight & Action */}
            <Card className="lg:col-span-2 group border-0 bg-background/60 backdrop-blur-sm hover:shadow-lg transition-all duration-300 motion-safe:animate-fade-up" style={{ animationDelay: '300ms' }}>
              <CardContent className="p-8">
                <div className="flex items-center justify-between mb-4">
                  <Icon3 className="h-12 w-12 text-primary group-hover:scale-110 transition-transform duration-300" />
                  <Badge variant="secondary" className="text-xs">{features[3].highlight}</Badge>
                </div>
                <h3 className="text-xl font-semibold mb-3 text-foreground">{features[3].title}</h3>
                <p className="text-muted-foreground leading-relaxed">{features[3].description}</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Value Section */}
      <section id="value" className="py-24">
        <div className="container mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-4xl font-bold mb-6 text-foreground">
                Make Better, Faster Decisions
              </h2>
              <p className="text-xl text-muted-foreground mb-8 leading-relaxed">
                The platform turns alarm data into live health metrics and prioritizes the sources that need attention most.
              </p>
              
              <div className="space-y-4">
                {benefits.map((benefit, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                    <span className="text-foreground">{benefit}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative">
              <Card className="p-8 bg-gradient-to-br from-primary/5 to-secondary/5 border-primary/20 motion-safe:animate-scale-in">
                <CardContent className="p-0">
                  <div className="text-center mb-6">
                    <AlertTriangle className="h-16 w-16 text-primary mx-auto mb-4" />
                    <h3 className="text-2xl font-bold text-foreground mb-2">Why it matters</h3>
                    <p className="text-muted-foreground">Clarity on what is unhealthy and by how much—at a glance.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-4 bg-background/50 rounded-lg">
                      <div className="text-2xl font-bold text-emerald-600">{isLoading ? '—' : `${(metrics?.healthy_percentage ?? 0).toFixed(1)}%`}</div>
                      <div className="text-sm text-muted-foreground">Healthy</div>
                    </div>
                    <div className="text-center p-4 bg-background/50 rounded-lg">
                      <div className="text-2xl font-bold text-amber-600">{isLoading ? '—' : `${(metrics?.unhealthy_percentage ?? 0).toFixed(1)}%`}</div>
                      <div className="text-sm text-muted-foreground">Unhealthy</div>
                    </div>
                  </div>
                  <Button className="w-full mt-6" asChild>
                    <a href="/dashboard">
                      Access PVC‑I Dashboard
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </a>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section id="cta" className="py-24 bg-gradient-to-r from-primary to-secondary bg-[length:200%_200%] motion-safe:animate-gradient-x">
        <div className="container mx-auto px-6 text-center">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-4xl font-bold mb-6 text-primary-foreground">
              Ready to Optimize Your Operations?
            </h2>
            <p className="text-xl text-primary-foreground/90 mb-8 leading-relaxed">
              Start with PVC‑I today—bring real-time alarm health, powerful visuals, and faster decisions to your operations.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" variant="secondary" className="px-8 py-3 text-lg" asChild>
                <a href="/dashboard">
                  Access Dashboard
                  <ArrowRight className="ml-2 h-5 w-5" />
                </a>
              </Button>
              <Button size="lg" variant="outline" className="px-8 py-3 text-lg border-primary-foreground text-primary-background hover:bg-primary-foreground hover:text-primary">
                Contact Support
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto px-6 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between">
            <div className="flex items-center gap-3 mb-4 md:mb-0">
              <Shield className="h-5 w-5 text-primary" />
              <p className="font-semibold text-foreground">Alarm Health Monitoring</p>
            </div>
            <div className="text-sm text-muted-foreground text-center md:text-right">
              <p>© 2025 Alarm Health Platform. All rights reserved.</p>
              <p>Live Alarm Health Monitoring for PVC‑I</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
