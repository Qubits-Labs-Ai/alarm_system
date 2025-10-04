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
import { useAuth } from '@/hooks/useAuth';
import engroLogo from '@/assets/engro-logo.png';
import { ModalProvider } from '@/components/providers/ModalProvider';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useEffect } from 'react';

interface PageShellProps {
  children: React.ReactNode;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  lastUpdated?: string;
}

export function PageShell({ 
  children,
  onRefresh,
  isRefreshing,
  lastUpdated,
}: PageShellProps) {
  const { logout, user } = useAuth();

  const handleLogout = () => {
    logout();
    window.location.href = '/';
  };

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
    // TODO: Implement view profile functionality
    console.log('View profile clicked');
  };

  const handleOpenSettings = () => {
    // TODO: Implement settings navigation
    console.log('Settings clicked');
  };

  // Keyboard shortcuts: Ctrl+P (profile), Ctrl+, (settings)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && (e.key === ',')) {
        e.preventDefault();
        handleOpenSettings();
      }
      if (e.ctrlKey && (e.key.toLowerCase() === 'p')) {
        e.preventDefault();
        handleViewProfile();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <ModalProvider />
      {/* Professional Header */}
      <header className="relative sticky top-0 z-50 border-b bg-dashboard-header-bg/50 backdrop-blur-sm shadow-sm">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-primary/3 to-secondary/5 bg-[length:200%_200%] motion-safe:animate-gradient-x"></div>
        <div className="relative container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Left Section - Logo and Title */}
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <img 
                    src={engroLogo} 
                    alt="Engro Polymer Chemicals" 
                    className="h-12 w-auto filter drop-shadow-sm"
                  />
                </div>
                <div className="border-l border-border pl-4">
                  <h1 className="text-2xl font-bold bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent motion-safe:animate-fade-up">
                  Standard-Aligned Alarm Management System
                  </h1>
                  <p className="text-sm text-muted-foreground font-medium">
                    Real-time monitoring & analytics
                  </p>
                </div>
              </div>
            </div>
            
            {/* Right Section - Actions & Profile */}
            <div className="flex items-center gap-6">

              {/* Theme Toggle */}
              <ThemeToggle />
              
              {/* Profile Dropdown - Minimal & Interactive */}
              <DropdownMenu>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          className="relative flex items-center px-1.5 py-1 h-9 w-9 bg-card/80 hover:bg-card border border-border/50 rounded-full backdrop-blur-sm transition-all duration-200 hover:shadow-md"
                          aria-label="Account menu"
                        >
                          <div className="relative">
                            <Avatar className="h-7 w-7 ring-2 ring-primary/30">
                              <AvatarImage src="" alt={user?.name || 'Admin'} />
                              <AvatarFallback className="bg-gradient-to-br from-primary to-secondary text-primary-foreground text-[10px] font-semibold">
                                {getUserInitials(user?.name || 'Admin')}
                              </AvatarFallback>
                            </Avatar>
                            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-card" />
                          </div>
                        </Button>
                      </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{user?.name || 'Admin'}</span>
                        <span className="text-xs text-muted-foreground">• Administrator</span>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <DropdownMenuContent
                  align="end"
                  className="w-64 bg-popover/95 backdrop-blur-sm border-border/50 shadow-xl"
                >
                  <div className="px-2 py-2 flex items-center gap-3">
                    <Avatar className="h-8 w-8 ring-2 ring-primary/30">
                      <AvatarImage src="" alt={user?.name || 'Admin'} />
                      <AvatarFallback className="bg-gradient-to-br from-primary to-secondary text-primary-foreground text-xs font-semibold">
                        {getUserInitials(user?.name || 'Admin')}
                      </AvatarFallback>
                    </Avatar>
                    <div className="leading-tight">
                      <div className="text-sm font-semibold">{user?.name || 'Admin'}</div>
                      <div className="text-xs text-muted-foreground">Administrator</div>
                    </div>
                  </div>
                  <DropdownMenuSeparator className="bg-border/50" />
                  <DropdownMenuItem
                    onClick={handleViewProfile}
                    className="flex items-center gap-2 cursor-pointer hover:bg-accent"
                  >
                    <User className="h-4 w-4" />
                    <span>View Profile</span>
                    <DropdownMenuShortcut>Ctrl+P</DropdownMenuShortcut>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={handleOpenSettings}
                    className="flex items-center gap-2 cursor-pointer hover:bg-accent"
                  >
                    <Settings className="h-4 w-4" />
                    <span>Settings</span>
                    <DropdownMenuShortcut>Ctrl+,</DropdownMenuShortcut>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-border/50" />
                  <DropdownMenuItem
                    onClick={handleLogout}
                    className="flex items-center gap-2 cursor-pointer text-destructive hover:bg-destructive/10"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>Sign Out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8 motion-safe:animate-fade-up">
        {children}
      </main>
    </div>
  );
}