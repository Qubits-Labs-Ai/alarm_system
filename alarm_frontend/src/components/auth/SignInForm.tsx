import { useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import LightRays from '@/components/ui/LightRays';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { LoginCredentials } from '@/types/auth';

interface SignInFormProps {
  onSuccess: () => void;
}

export function SignInForm({ onSuccess }: SignInFormProps) {
  const { login } = useAuth();
  const [credentials, setCredentials] = useState<LoginCredentials>({
    email: '',
    password: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [shake, setShake] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const success = login(credentials);
      if (success) {
        onSuccess();
      } else {
        setError('Invalid email or password. Please try again.');
        // Trigger shake feedback on error
        setShake(true);
        setTimeout(() => setShake(false), 500);
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
      setShake(true);
      setTimeout(() => setShake(false), 500);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (field: keyof LoginCredentials) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    setCredentials(prev => ({ ...prev, [field]: e.target.value }));
    if (error) setError(''); // Clear error when user starts typing
  };

  useEffect(() => {
    if (!error) return;
    // Auto clear after a while to keep UI clean
    const t = setTimeout(() => setError(''), 4000);
    return () => clearTimeout(t);
  }, [error]);

  return (
    <div className="relative min-h-[100svh] flex items-center justify-center bg-background overflow-hidden isolate">
      {/* Animated aurora background */}
      {/* Dark mode */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0 hidden dark:block">
        <div className="absolute -top-40 -left-40 w-[70vw] h-[70vw] rounded-full blur-3xl opacity-70 animate-aurora bg-[radial-gradient(circle_at_30%_30%,hsl(var(--primary)/0.25),transparent_60%)]" />
        <div className="absolute -bottom-40 -right-52 w-[60vw] h-[60vw] rounded-full blur-3xl opacity-70 animate-aurora [animation-delay:4s] bg-[radial-gradient(circle_at_70%_70%,hsl(var(--success)/0.22),transparent_60%)]" />
      </div>
      {/* Light mode */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0 block dark:hidden">
        {/* White base background */}
        <div className="absolute inset-0 bg-white" />
        {/* Green aurora blobs - vibrant and visible like dark mode */}
        <div className="absolute -top-40 -left-40 w-[70vw] h-[70vw] rounded-full blur-3xl opacity-70 animate-aurora bg-[radial-gradient(circle_at_30%_30%,hsl(120_60%_70%),transparent_60%)]" />
        <div className="absolute -bottom-40 -right-52 w-[60vw] h-[60vw] rounded-full blur-3xl opacity-65 animate-aurora [animation-delay:4s] bg-[radial-gradient(circle_at_70%_70%,hsl(140_55%_65%),transparent_60%)]" />
        <div className="absolute top-1/4 -right-32 w-[50vw] h-[50vw] rounded-full blur-3xl opacity-60 animate-aurora [animation-delay:2s] bg-[radial-gradient(circle_at_60%_40%,hsl(130_65%_68%),transparent_65%)]" />
        {/* Center glow for depth */}
        <div className="absolute inset-0 bg-[radial-gradient(600px_300px_at_center,hsl(125_50%_75%/0.15),transparent_70%)]" />
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-0 z-20">
        {/* Dark theme: bright, screen blend */}
        <div className="hidden dark:block w-full h-full">
          <LightRays
            raysOrigin="top-center"
            raysColor="#ffffff"
            raysSpeed={1.2}
            lightSpread={0.6}
            rayLength={1.8}
            followMouse={true}
            mouseInfluence={0.12}
            noiseAmount={0.06}
            distortion={0.05}
            className="mix-blend-screen opacity-85"
          />
        </div>
        {/* Light theme: no rays (cleaner, shadow-focused background) */}
        <div className="hidden dark:hidden w-full h-full" />
      </div>

      {/* Spotlight under the card (dark mode only) */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-10 hidden dark:flex items-center justify-center">
        <div className="spotlight w-[1200px] h-[600px] rounded-full" />
      </div>

      {/* Form container */}
      <div className={`relative z-30 w-full max-w-md p-4 motion-safe:animate-fade-up ${shake ? 'animate-shake' : ''}`}>
        <div className="shadow-input mx-auto w-full rounded-none bg-card p-4 md:rounded-2xl md:p-8 border border-border">
          <h2 className="text-xl font-bold text-foreground text-center">Plant Health Dashboard</h2>
          <p className="mt-2 max-w-sm mx-auto text-sm text-muted-foreground text-center">
            Sign in to access the plant monitoring system
          </p>

          <form className="my-8" onSubmit={handleSubmit}>
            <LabelInputContainer className="mb-4">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@gmail.com"
                value={credentials.email}
                onChange={handleInputChange('email')}
                required
                aria-describedby={error ? 'error-message' : undefined}
              />
            </LabelInputContainer>

            <LabelInputContainer className="mb-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter password"
                  value={credentials.password}
                  onChange={handleInputChange('password')}
                  required
                  aria-describedby={error ? 'error-message' : undefined}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={`absolute right-0 top-0 h-full px-3 hover:bg-transparent transition-transform ${showPassword ? 'rotate-12' : ''}`}
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </LabelInputContainer>

            {error && (
              <div
                id="error-message"
                className="text-sm text-destructive bg-destructive/10 p-3 rounded border mb-4"
                role="alert"
              >
                {error}
              </div>
            )}

            <button
              className="group/btn relative block h-10 w-full rounded-md bg-gradient-to-br from-primary to-success font-medium text-primary-foreground shadow-input disabled:opacity-60 disabled:cursor-not-allowed"
              type="submit"
              disabled={isLoading || !credentials.email || !credentials.password}
            >
              {isLoading ? 'Signing in…' : 'Sign In'}
              <BottomGradient />
            </button>

            <div className="mt-6 p-3 bg-muted rounded text-sm">
              <p className="font-medium mb-1">Demo credentials:</p>
              <p>Email: admin@gmail.com</p>
              <p>Password: admin123</p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// Aceternity-like bottom hover gradient used by the CTA button
const BottomGradient = () => {
  return (
    <>
      <span className="absolute inset-x-0 -bottom-px block h-px w-full bg-gradient-to-r from-transparent via-cyan-500 to-transparent opacity-0 transition duration-500 group-hover/btn:opacity-100" />
      <span className="absolute inset-x-10 -bottom-px mx-auto block h-px w-1/2 bg-gradient-to-r from-transparent via-indigo-500 to-transparent opacity-0 blur-sm transition duration-500 group-hover/btn:opacity-100" />
    </>
  );
};

// Small wrapper to keep label/inputs aligned with consistent spacing
const LabelInputContainer = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  const base = 'flex w-full flex-col space-y-2';
  return <div className={className ? `${base} ${className}` : base}>{children}</div>;
};