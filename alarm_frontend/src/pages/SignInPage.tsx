import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { SignInForm } from '@/components/auth/SignInForm';
import { useAuth } from '@/hooks/useAuth';
import { GridBackground } from '@/components/landing/GridBackground';
import { GradientOrb } from '@/components/landing/GradientOrb';
import PixelBlast from '@/components/ui/PixelBlast';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import engroLogo from '@/assets/engro-logo.png';

export default function SignInPage() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate]);

  if (isLoading) {
    return (
      <div className="relative min-h-screen flex items-center justify-center bg-background overflow-hidden isolate">
        {/* Background elements for loading state consistency */}
        <div className="absolute inset-0 z-0">
          <GridBackground gridSize={60} gridColor="var(--landing-grid-hero)" />
          <GradientOrb
            size="xl"
            color="green"
            className="top-[-10%] left-[-10%] opacity-40"
            animated={true}
          />
          <GradientOrb
            size="lg"
            color="green"
            className="bottom-[-10%] right-[-10%] opacity-40"
            animated={true}
          />
          <PixelBlast
            className="absolute inset-0 opacity-20"
            variant="circle"
            pixelSize={4}
            color="#a3e635"
            patternScale={4}
            patternDensity={0.8}
            speed={0.3}
            transparent
            noiseAmount={0.03}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/20 to-background/80" />
        </div>

        <div className="relative z-10 text-center">
          <div className="h-10 w-10 border-2 border-lime-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground animate-pulse">Loading...</p>
        </div>
      </div>
    );
  }

  const handleSignInSuccess = () => {
    navigate('/dashboard', { replace: true });
  };

  return (
    <div className="relative">
      {/* Minimal Header - Logo and Theme Toggle Only */}
      <header className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[95%] max-w-7xl">
        <div className="relative rounded-[25px] border border-border/40 bg-background/60 backdrop-blur-xl shadow-lg">
          <div className="px-6 py-3">
            <div className="flex items-center justify-between">
              {/* Logo */}
              <div
                className="flex items-center gap-3 cursor-pointer group"
                onClick={() => navigate('/')}
              >
                <img
                  src={engroLogo}
                  alt="Engro Logo"
                  className="h-8 w-auto group-hover:scale-105 transition-transform duration-200"
                />
                <div className="hidden sm:block">
                  <h1 className="text-sm font-bold text-foreground tracking-tight leading-tight">
                    Alarm Management System
                  </h1>
                  <p className="text-xs text-muted-foreground">
                    Real-time monitoring & analytics
                  </p>
                </div>
              </div>

              {/* Theme Toggle */}
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>

      {/* Sign In Form */}
      <SignInForm onSuccess={handleSignInSuccess} />
    </div>
  );
}