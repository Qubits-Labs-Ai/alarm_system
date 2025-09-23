import { useState, useEffect } from 'react';
import { ArrowRight, Shield, BarChart3, Clock, Users, CheckCircle, TrendingUp, AlertTriangle, Activity, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import engroLogo from '@/assets/engro-logo.svg';

const LandingPage = () => {
  const [currentStat, setCurrentStat] = useState(0);
  
  // Animated statistics
  const stats = [
    { label: "Plant Uptime", value: "99.7%", icon: TrendingUp, color: "text-green-600" },
    { label: "Active Monitoring Points", value: "26,740", icon: Activity, color: "text-blue-600" },
    { label: "Response Time", value: "<10ms", icon: Zap, color: "text-purple-600" },
    { label: "Data Files Processed", value: "76", icon: BarChart3, color: "text-orange-600" }
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentStat((prev) => (prev + 1) % stats.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const features = [
    {
      icon: Shield,
      title: "Real-Time Monitoring",
      description: "Continuous monitoring of PVC production lines, caustic soda systems, and chemical processes with instant alert capabilities.",
      highlight: "24/7 Protection"
    },
    {
      icon: BarChart3,
      title: "Advanced Analytics",
      description: "Sophisticated data visualization with word clouds, bar charts, and timeline views for comprehensive plant health insights.",
      highlight: "AI-Powered"
    },
    {
      icon: Clock,
      title: "Predictive Maintenance",
      description: "Early warning systems that identify potential equipment failures before they impact production efficiency.",
      highlight: "Proactive"
    },
    {
      icon: Users,
      title: "Scalable Architecture",
      description: "Currently optimized for PVC-I production line with expandable framework designed for future multi-plant integration.",
      highlight: "Expandable"
    }
  ];

  const benefits = [
    "Reduce unplanned downtime by up to 85%",
    "Optimize chemical process efficiency",
    "Ensure regulatory compliance and safety",
    "Minimize maintenance costs",
    "Improve product quality consistency",
    "Real-time decision making capabilities"
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      {/* Header */}
      <header className="relative border-b bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <img 
                src={engroLogo} 
                alt="Engro Polymer & Chemicals" 
                className="h-10 w-auto"
              />
              <div className="border-l border-border pl-4">
                <h1 className="text-lg font-bold text-foreground">
                  Plant Health Monitoring
                </h1>
                <p className="text-sm text-muted-foreground">
                  Engro Polymer & Chemicals Limited
                </p>
              </div>
            </div>
            <Button asChild>
              <a href="/signin">Access Dashboard</a>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative py-20 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-transparent to-secondary/10"></div>
        <div className="container mx-auto px-6 relative">
          <div className="max-w-4xl mx-auto text-center">
            <Badge variant="secondary" className="mb-6 px-4 py-2 text-sm font-medium">
              Industry-Leading Chemical Plant Monitoring
            </Badge>
            
            <h1 className="text-5xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-foreground via-primary to-secondary bg-clip-text text-transparent leading-tight">
              Advanced Plant Health
              <br />
              <span className="text-primary">Monitoring System</span>
            </h1>
            
            <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto leading-relaxed">
              Pakistan's premier chemical manufacturing facility leverages cutting-edge monitoring technology 
              to ensure optimal performance across PVC production, caustic soda systems, and chemical processes.
            </p>
            
            <div className="mb-8">
              <Badge variant="outline" className="px-4 py-2 text-sm font-medium border-primary/30 text-primary">
                Currently Monitoring: PVC-I Production Line
              </Badge>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
              <Button size="lg" className="px-8 py-3 text-lg" asChild>
                <a href="/dashboard">
                  View Live Dashboard
                  <ArrowRight className="ml-2 h-5 w-5" />
                </a>
              </Button>
              <Button size="lg" variant="outline" className="px-8 py-3 text-lg">
                Learn More
              </Button>
            </div>

            {/* Animated Statistics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto">
              {stats.map((stat, index) => (
                <Card 
                  key={index}
                  className={`transition-all duration-500 ${
                    currentStat === index 
                      ? 'ring-2 ring-primary shadow-lg scale-105' 
                      : 'hover:shadow-md'
                  }`}
                >
                  <CardContent className="p-6 text-center">
                    <stat.icon className={`h-8 w-8 mx-auto mb-3 ${stat.color}`} />
                    <div className="text-2xl font-bold text-foreground mb-1">
                      {stat.value}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {stat.label}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4 text-foreground">
              Comprehensive Monitoring Solutions
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Our advanced monitoring system provides real-time insights into every aspect 
              of your chemical manufacturing processes.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature, index) => (
              <Card key={index} className="group hover:shadow-lg transition-all duration-300 border-0 bg-background/60 backdrop-blur-sm">
                <CardContent className="p-8">
                  <div className="flex items-center justify-between mb-4">
                    <feature.icon className="h-12 w-12 text-primary group-hover:scale-110 transition-transform duration-300" />
                    <Badge variant="secondary" className="text-xs">
                      {feature.highlight}
                    </Badge>
                  </div>
                  <h3 className="text-xl font-semibold mb-3 text-foreground">
                    {feature.title}
                  </h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-20">
        <div className="container mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-4xl font-bold mb-6 text-foreground">
                Transforming Chemical Manufacturing
              </h2>
              <p className="text-xl text-muted-foreground mb-8 leading-relaxed">
                As Pakistan's sole manufacturer of PVC resin and a leading producer of caustic soda, 
                Engro Polymer & Chemicals Limited has deployed our advanced monitoring system for the 
                PVC-I production line, establishing a foundation for comprehensive plant-wide monitoring.
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
              <Card className="p-8 bg-gradient-to-br from-primary/5 to-secondary/5 border-primary/20">
                <CardContent className="p-0">
                  <div className="text-center mb-6">
                    <AlertTriangle className="h-16 w-16 text-primary mx-auto mb-4" />
                    <h3 className="text-2xl font-bold text-foreground mb-2">
                      PVC-I Live Status
                    </h3>
                    <p className="text-muted-foreground">
                      Current production line health
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-4 bg-background/50 rounded-lg">
                      <div className="text-2xl font-bold text-green-600">99.7%</div>
                      <div className="text-sm text-muted-foreground">Healthy Sources</div>
                    </div>
                    <div className="text-center p-4 bg-background/50 rounded-lg">
                      <div className="text-2xl font-bold text-orange-600">0.3%</div>
                      <div className="text-sm text-muted-foreground">Monitoring</div>
                    </div>
                  </div>
                  
                  <Button className="w-full mt-6" asChild>
                    <a href="/dashboard">
                      Access PVC-I Dashboard
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
      <section className="py-20 bg-gradient-to-r from-primary to-secondary">
        <div className="container mx-auto px-6 text-center">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-4xl font-bold mb-6 text-primary-foreground">
              Ready to Optimize Your Operations?
            </h2>
            <p className="text-xl text-primary-foreground/90 mb-8 leading-relaxed">
              Join the future of chemical manufacturing with our comprehensive plant health monitoring system. 
              Get real-time insights, predictive analytics, and operational excellence.
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
            <div className="flex items-center gap-4 mb-4 md:mb-0">
              <img 
                src={engroLogo} 
                alt="Engro Polymer & Chemicals" 
                className="h-8 w-auto"
              />
              <div>
                <p className="font-semibold text-foreground">Engro Polymer & Chemicals Limited</p>
                <p className="text-sm text-muted-foreground">Pakistan's Premier Chemical Manufacturing</p>
              </div>
            </div>
            <div className="text-sm text-muted-foreground text-center md:text-right">
              <p>© 2025 Engro Polymer & Chemicals Limited. All rights reserved.</p>
              <p>Advanced Plant Health Monitoring System</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
