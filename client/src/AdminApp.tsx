import { lazy, Suspense, useEffect } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/adminQueryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LoadingSpinner } from "@/components/loading-spinner";
import { hasAdminAccess } from "./lib/adminQueryClient";

const Admin = lazy(() => import("@/pages/admin"));
const AdminLogin = lazy(() => import("@/pages/AdminLogin"));

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-black">
      <div className="flex flex-col items-center gap-4">
        <LoadingSpinner size="md" />
        <p className="text-purple-400 font-satoshi" data-testid="loading-text">Loading...</p>
      </div>
    </div>
  );
}

function CatchAllRedirect() {
  const [, setLocation] = useLocation();
  useEffect(() => { setLocation("/"); }, [setLocation]);
  return <LoadingFallback />;
}

function Router() {
  const [location, setLocation] = useLocation();

  // Redirect to login if no admin access
  useEffect(() => {
    if (location !== "/login" && !hasAdminAccess()) {
      setLocation("/login");
    }
  }, [location, setLocation]);

  return (
    <Suspense fallback={<LoadingFallback />}>
      <Switch>
        <Route path="/login" component={AdminLogin} />
        <Route path="/" component={Admin} />
        <Route component={CatchAllRedirect} />
      </Switch>
    </Suspense>
  );
}

function AdminApp() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default AdminApp;
