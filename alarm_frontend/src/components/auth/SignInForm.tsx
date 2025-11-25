import { useEffect, useState } from 'react';
import { Eye, EyeOff, ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { LoginCredentials } from '@/types/auth';
import { GridBackground } from '@/components/landing/GridBackground';
import { GradientOrb } from '@/components/landing/GradientOrb';
import PixelBlast from '@/components/ui/PixelBlast';
import { Badge } from '@/components/ui/badge';

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
            {/* Sophisticated Background */}
            <div className="absolute inset-0 z-0">
                {/* Grid Background */}
                <GridBackground gridSize={60} gridColor="var(--landing-grid-hero)" />

                {/* Animated Gradient Orbs */}
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

                {/* Subtle PixelBlast Effect */}
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

                {/* Vignette for focus */}
                <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/20 to-background/80" />
            </div>

            {/* Form container */}
            <div className={`relative z-30 w-full max-w-md p-6 motion-safe:animate-fade-up ${shake ? 'animate-shake' : ''}`}>
                <div className="relative overflow-hidden rounded-3xl border border-lime-accent/20 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-xl p-8 shadow-2xl">
                    {/* Decorative top glow */}
                    <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-lime-accent/50 to-transparent opacity-50" />

                    <div className="flex flex-col items-center text-center mb-8">
                        <Badge
                            variant="outline"
                            className="mb-4 border-primary/30 dark:border-lime-accent/30 bg-primary/5 dark:bg-lime-accent/5 text-primary dark:text-lime-accent py-1 px-3 backdrop-blur-sm"
                        >
                            <Sparkles className="h-3 w-3 mr-2" />
                            Secure Access
                        </Badge>
                        <h2 className="text-3xl font-black text-foreground tracking-tight">
                            Welcome <span className="text-primary dark:text-lime-accent">Back</span>
                        </h2>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Sign in to access the plant monitoring system
                        </p>
                    </div>

                    <form className="space-y-5" onSubmit={handleSubmit}>
                        <LabelInputContainer>
                            <Label htmlFor="email" className="text-foreground/80">Email Address</Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="admin@gmail.com"
                                value={credentials.email}
                                onChange={handleInputChange('email')}
                                required
                                className="bg-white/80 dark:bg-zinc-800/80 border-border/50 focus:border-lime-accent/50 focus:ring-lime-accent/20 transition-all text-foreground"
                                aria-describedby={error ? 'error-message' : undefined}
                            />
                        </LabelInputContainer>

                        <LabelInputContainer>
                            <div className="flex items-center justify-between">
                                <Label htmlFor="password" className="text-foreground/80">Password</Label>
                                <a href="#" className="text-xs text-primary dark:text-lime-accent hover:underline opacity-80">Forgot password?</a>
                            </div>
                            <div className="relative">
                                <Input
                                    id="password"
                                    type={showPassword ? 'text' : 'password'}
                                    placeholder="Enter password"
                                    value={credentials.password}
                                    onChange={handleInputChange('password')}
                                    required
                                    className="bg-white/80 dark:bg-zinc-800/80 border-border/50 focus:border-lime-accent/50 focus:ring-lime-accent/20 transition-all pr-10 text-foreground"
                                    aria-describedby={error ? 'error-message' : undefined}
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className={`absolute right-0 top-0 h-full px-3 hover:bg-transparent text-muted-foreground hover:text-foreground transition-all ${showPassword ? 'text-primary dark:text-lime-accent' : ''}`}
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
                                className="text-sm text-destructive bg-destructive/10 p-3 rounded-lg border border-destructive/20 flex items-center gap-2 animate-in fade-in slide-in-from-top-2"
                                role="alert"
                            >
                                <div className="h-1.5 w-1.5 rounded-full bg-destructive" />
                                {error}
                            </div>
                        )}

                        <Button
                            className="w-full h-11 bg-lime-accent hover:bg-lime-accent/90 text-black font-bold text-base transition-all hover:scale-[1.02] hover:shadow-lg hover:shadow-lime-accent/20"
                            type="submit"
                            disabled={isLoading || !credentials.email || !credentials.password}
                        >
                            {isLoading ? (
                                <span className="flex items-center gap-2">
                                    <div className="h-4 w-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                                    Signing in...
                                </span>
                            ) : (
                                <span className="flex items-center justify-center gap-2">
                                    Sign In <ArrowRight className="h-4 w-4" />
                                </span>
                            )}
                        </Button>

                        <div className="mt-6 p-4 bg-muted/30 dark:bg-zinc-800/50 border border-border/30 rounded-xl text-sm backdrop-blur-sm">
                            <p className="font-medium mb-2 text-muted-foreground flex items-center gap-2">
                                <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">DEMO</Badge>
                                Credentials
                            </p>
                            <div className="space-y-1 text-xs font-mono text-muted-foreground/80">
                                <div className="flex justify-between">
                                    <span>Email:</span>
                                    <span className="text-foreground select-all">admin@gmail.com</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Password:</span>
                                    <span className="text-foreground select-all">admin123</span>
                                </div>
                            </div>
                        </div>
                    </form>
                </div>

                <p className="text-center text-xs text-muted-foreground mt-8 opacity-60">
                    &copy; {new Date().getFullYear()} Alarm System. All rights reserved.
                </p>
            </div>
        </div>
    );
}

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
