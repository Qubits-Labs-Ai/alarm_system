import { useAuth } from '@/hooks/useAuth';
import { ModalProvider } from '@/components/providers/ModalProvider';
import { Header } from '@/components/shared/Header';
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


  return (
    <div className="min-h-screen bg-background">
      <ModalProvider />
      <Header
        variant="dashboard"
        user={user}
        onLogout={handleLogout}
        title="AlarmCopilot"
        subtitle="Real-time monitoring & analytics"
      />

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8 pt-28 motion-safe:animate-fade-up">
        {children}
      </main>
    </div>
  );
}