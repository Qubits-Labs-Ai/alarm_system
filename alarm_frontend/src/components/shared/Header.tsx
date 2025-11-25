import { LogOut, User, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    DropdownMenuShortcut,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import engroLogo from '@/assets/engro-logo.png';

interface NavLink {
    label: string;
    href: string;
    onClick?: (e: React.MouseEvent) => void;
}

interface UserData {
    name?: string;
}

interface HeaderProps {
    variant: 'landing' | 'dashboard';
    user?: UserData;
    onLogout?: () => void;
    navLinks?: NavLink[];
    title?: string;
    subtitle?: string;
}

export function Header({
    variant,
    user,
    onLogout,
    navLinks = [],
    title = 'Alarm Management System',
    subtitle = 'Real-time monitoring & analytics'
}: HeaderProps) {
    const getUserInitials = (name?: string) => {
        if (!name) return 'AD';
        return name
            .split(' ')
            .map(n => n[0])
            .join('')
            .toUpperCase()
            .slice(0, 2);
    };

    const handleViewProfile = () => {
        console.log('View profile clicked');
    };

    const handleOpenSettings = () => {
        console.log('Settings clicked');
    };

    return (
        <header className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[95%] max-w-7xl">
            {/* Glassmorphic Container */}
            <div className="relative rounded-[25px] border border-border/40 bg-background/60 backdrop-blur-xl shadow-lg">
                <div className="px-8 py-4">
                    <div className="flex items-center justify-between gap-8">
                        {/* Left Section - Logo and Title */}
                        <div className="flex items-center gap-4">
                            <div 
                                className="flex items-center gap-3 cursor-pointer group"
                                onClick={() => window.location.href = variant === 'landing' ? '/' : '/dashboard'}
                            >
                                <img
                                    src={engroLogo}
                                    alt="Engro Logo"
                                    className="h-8 w-auto group-hover:scale-105 transition-transform duration-200"
                                />
                                <div className="hidden sm:block">
                                    <h1 className="text-sm font-bold text-foreground tracking-tight leading-tight">
                                        {title}
                                    </h1>
                                    <p className="text-xs text-muted-foreground">
                                        {subtitle}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Center Section - Navigation (Landing only) */}
                        {variant === 'landing' && navLinks.length > 0 && (
                            <nav className="hidden md:flex items-center gap-8">
                                {navLinks.map((link, index) => (
                                    <a
                                        key={index}
                                        href={link.href}
                                        onClick={link.onClick}
                                        className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                                    >
                                        {link.label}
                                    </a>
                                ))}
                            </nav>
                        )}

                        {/* Right Section - Actions */}
                        <div className="flex items-center gap-3">
                            <ThemeToggle />

                            {variant === 'dashboard' && user ? (
                                <DropdownMenu>
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <DropdownMenuTrigger asChild>
                                                    <Button
                                                        variant="ghost"
                                                        className="relative h-9 w-9 rounded-full hover:bg-accent/50"
                                                        aria-label="Account menu"
                                                    >
                                                        <Avatar className="h-8 w-8 ring-2 ring-primary/30 ring-offset-2 ring-offset-background transition-all hover:ring-primary/50">
                                                            <AvatarImage src="" alt={user?.name || 'Admin'} />
                                                            <AvatarFallback className="bg-gradient-to-br from-primary via-primary/90 to-primary/80 text-primary-foreground text-xs font-bold">
                                                                {getUserInitials(user?.name || 'Admin')}
                                                            </AvatarFallback>
                                                        </Avatar>
                                                        <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-background shadow-sm" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                            </TooltipTrigger>
                                            <TooltipContent side="bottom" className="font-medium">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm">{user?.name || 'Admin'}</span>
                                                    <span className="text-xs text-muted-foreground">• Administrator</span>
                                                </div>
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                    <DropdownMenuContent
                                        align="end"
                                        className="w-64 bg-popover/98 backdrop-blur-md border-border/60 shadow-2xl rounded-xl"
                                    >
                                        <div className="px-3 py-3 flex items-center gap-3 bg-accent/30 rounded-t-lg">
                                            <Avatar className="h-10 w-10 ring-2 ring-primary/40">
                                                <AvatarImage src="" alt={user?.name || 'Admin'} />
                                                <AvatarFallback className="bg-gradient-to-br from-primary via-primary/90 to-primary/80 text-primary-foreground text-sm font-bold">
                                                    {getUserInitials(user?.name || 'Admin')}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div className="flex-1 leading-tight">
                                                <div className="text-sm font-bold text-foreground">{user?.name || 'Admin'}</div>
                                                <div className="text-xs font-medium text-muted-foreground mt-0.5">Administrator</div>
                                            </div>
                                            <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-sm" />
                                        </div>
                                        <DropdownMenuSeparator className="bg-border/60 my-1" />
                                        <div className="p-1">
                                            <DropdownMenuItem
                                                onClick={handleViewProfile}
                                                className="flex items-center gap-3 cursor-pointer hover:bg-accent rounded-md px-3 py-2.5"
                                            >
                                                <User className="h-4 w-4 text-muted-foreground" />
                                                <span className="font-medium">View Profile</span>
                                                <DropdownMenuShortcut className="text-xs">Ctrl+P</DropdownMenuShortcut>
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                                onClick={handleOpenSettings}
                                                className="flex items-center gap-3 cursor-pointer hover:bg-accent rounded-md px-3 py-2.5"
                                            >
                                                <Settings className="h-4 w-4 text-muted-foreground" />
                                                <span className="font-medium">Settings</span>
                                                <DropdownMenuShortcut className="text-xs">Ctrl+,</DropdownMenuShortcut>
                                            </DropdownMenuItem>
                                        </div>
                                        <DropdownMenuSeparator className="bg-border/60 my-1" />
                                        <div className="p-1">
                                            <DropdownMenuItem
                                                onClick={onLogout}
                                                className="flex items-center gap-3 cursor-pointer text-destructive hover:bg-destructive/15 rounded-md px-3 py-2.5 font-medium"
                                            >
                                                <LogOut className="h-4 w-4" />
                                                <span>Sign Out</span>
                                            </DropdownMenuItem>
                                        </div>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            ) : (
                                <Button 
                                    asChild 
                                    className="bg-lime-accent hover:bg-lime-accent/90 text-black font-semibold shadow-sm hover:shadow-md transition-all rounded-full px-6"
                                >
                                    <a href="/signin">Get Started</a>
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </header>
    );
}
