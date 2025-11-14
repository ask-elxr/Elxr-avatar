import { lazy, Suspense } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

const Home = lazy(() => import("@/pages/home"));
const Admin = lazy(() => import("@/pages/admin"));
const Account = lazy(() => import("@/pages/Account"));
const KnowledgeBase = lazy(() => import("@/pages/KnowledgeBase"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const NotFound = lazy(() => import("@/pages/not-found"));

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-black">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" data-testid="loading-spinner"></div>
        <p className="text-purple-400 font-satoshi" data-testid="loading-text">Loading...</p>
      </div>
    </div>
  );
}

function Router() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/avatar" component={Home} />
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/knowledge-base" component={KnowledgeBase} />
        <Route path="/admin" component={Admin} />
        <Route path="/account" component={Account} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
