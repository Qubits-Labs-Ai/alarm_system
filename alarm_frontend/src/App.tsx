import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import SignInPage from "./pages/SignInPage";
import DashboardPage from "./pages/DashboardPage";
import NotFound from "./pages/NotFound";
import AgentPage from "./pages/AgentPage";

// React Query global defaults: cache and serve instantly without background refetches
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data is fairly static during a session; keep it fresh for 15 minutes
      staleTime: 15 * 60 * 1000,
      // Retain cached queries for 60 minutes to allow quick tab switching
      gcTime: 60 * 60 * 1000,
      // Do not auto-refetch on focus/mount/reconnect; user can manually refresh
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
      retry: 1,
      // Keep previous data while switching keys to avoid flicker
      placeholderData: (prev) => prev,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/signin" element={<SignInPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/:plant/agent" element={<AgentPage />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
