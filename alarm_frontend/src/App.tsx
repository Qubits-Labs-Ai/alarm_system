import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import SignInPage from "./pages/SignInPage";
import DashboardPage from "./pages/DashboardPage";
import { ActualCalcPage } from "./pages/ActualCalcPage";
import NotFound from "./pages/NotFound";
import AgentPage from "./pages/AgentPage";
import PVCIAgentPage from "./pages/PVCIAgentPage";

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
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/signin" element={<SignInPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/actual-calc" element={<ActualCalcPage />} />
          <Route path="/:plant/agent" element={<AgentPage />} />
          <Route path="/pvci/agent-sql" element={<PVCIAgentPage />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
