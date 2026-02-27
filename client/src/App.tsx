import { lazy, Suspense, useEffect } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LoadingSpinner } from "@/components/loading-spinner";
import { useAuth } from "@/hooks/useAuth";
import { useAuthSync } from "@/hooks/useAuthSync";
import { useAnonymousUser } from "@/hooks/useAnonymousUser";
import { useChatVideoNotifications } from "@/hooks/useChatVideoNotifications";
import { useCourseVideoNotifications } from "@/hooks/useCourseVideoNotifications";

const Landing = lazy(() => import("@/pages/landing"));
const AvatarSelect = lazy(() => import("@/pages/avatar-select"));
const Home = lazy(() => import("@/pages/home"));
const Admin = lazy(() => import("@/pages/admin"));
const Account = lazy(() => import("@/pages/Account"));
const KnowledgeBase = lazy(() => import("@/pages/KnowledgeBase"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const MyVideos = lazy(() => import("@/pages/MyVideos"));
const Courses = lazy(() => import("@/pages/courses"));
const CourseBuilder = lazy(() => import("@/pages/course-builder"));
const Analytics = lazy(() => import("@/pages/Analytics"));
const Credits = lazy(() => import("@/pages/Credits"));
const NotFound = lazy(() => import("@/pages/not-found"));
const LiveAvatarTest = lazy(() => import("@/pages/liveavatar-test"));
const SDKTest = lazy(() => import("@/pages/sdk-test"));
const AdminLogin = lazy(() => import("@/pages/AdminLogin"));

const EmbedPage = lazy(() => import("@/pages/embed/index"));
const EmbedAdmin = lazy(() => import("@/pages/embed/admin"));

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

function GlobalVideoNotifications() {
  const { user } = useAuth();
  const { userId: anonymousUserId } = useAnonymousUser();
  const effectiveUserId = user?.id || anonymousUserId;
  
  useChatVideoNotifications(effectiveUserId);
  useCourseVideoNotifications(effectiveUserId);
  
  return null;
}

function AuthSyncListener() {
  useAuthSync();
  return null;
}

function Router() {
  const [location, setLocation] = useLocation();
  
  // Detect admin subdomain and redirect to admin login
  useEffect(() => {
    const hostname = window.location.hostname;
    const isAdminSubdomain = hostname.startsWith('admin.');
    
    // If on admin subdomain and not already on admin pages, redirect to admin-login
    if (isAdminSubdomain && !location.startsWith('/admin')) {
      setLocation('/admin-login');
    }
  }, [location, setLocation]);
  
  return (
    <Suspense fallback={<LoadingFallback />}>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/landing" component={Landing} />
        <Route path="/avatar-select" component={AvatarSelect} />
        <Route path="/chat" component={Home} />
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/dashboard/chat" component={Dashboard} />
        <Route path="/dashboard/chat/:avatarId" component={Dashboard} />
        <Route path="/dashboard/mentors" component={Dashboard} />
        <Route path="/dashboard/mentors/:avatarId" component={Dashboard} />
        <Route path="/mentors" component={Dashboard} />
        <Route path="/mentors/:avatarId" component={Dashboard} />
        <Route path="/dashboard/videos" component={Dashboard} />
        <Route path="/dashboard/courses" component={Dashboard} />
        <Route path="/dashboard/courses/new/edit" component={Dashboard} />
        <Route path="/dashboard/courses/:courseId" component={Dashboard} />
        <Route path="/dashboard/courses/:courseId/edit" component={Dashboard} />
        <Route path="/dashboard/mood" component={Dashboard} />
        <Route path="/dashboard/plan" component={Dashboard} />
        <Route path="/dashboard/credits" component={Dashboard} />
        <Route path="/dashboard/settings" component={Dashboard} />
        <Route path="/my-videos" component={MyVideos} />
        <Route path="/knowledge-base" component={KnowledgeBase} />
        <Route path="/courses" component={Courses} />
        <Route path="/course-builder" component={CourseBuilder} />
        <Route path="/course-builder/:id" component={CourseBuilder} />
        <Route path="/admin" component={Admin} />
        <Route path="/admin-login" component={AdminLogin} />
        <Route path="/analytics" component={Analytics} />
        <Route path="/credits" component={Credits} />
        <Route path="/account" component={Account} />
        <Route path="/liveavatar-test" component={LiveAvatarTest} />
        <Route path="/sdk-test" component={SDKTest} />
        
        {/* Embed routes - content only pages for Webflow embedding */}
        <Route path="/embed/dashboard">{() => <EmbedPage view="dashboard" />}</Route>
        <Route path="/embed/chat">{() => <EmbedPage view="chat" />}</Route>
        <Route path="/embed/chat/:avatarId">{(params) => <EmbedPage view="chat" avatarId={params.avatarId} />}</Route>
        <Route path="/embed/mentors">{() => <EmbedPage view="chat" />}</Route>
        <Route path="/embed/mentors/:avatarId">{(params) => <EmbedPage view="chat" avatarId={params.avatarId} />}</Route>
        <Route path="/embed/videos">{() => <EmbedPage view="videos" />}</Route>
        <Route path="/embed/courses">{() => <EmbedPage view="courses" />}</Route>
        <Route path="/embed/courses/new/edit">{() => <EmbedPage view="course-edit" />}</Route>
        <Route path="/embed/courses/:courseId">{(params) => <EmbedPage view="course-view" courseId={params.courseId} />}</Route>
        <Route path="/embed/courses/:courseId/edit">{(params) => <EmbedPage view="course-edit" courseId={params.courseId} />}</Route>
        <Route path="/embed/mood">{() => <EmbedPage view="mood" />}</Route>
        <Route path="/embed/plan">{() => <EmbedPage view="plan" />}</Route>
        <Route path="/embed/credits">{() => <EmbedPage view="credits" />}</Route>
        <Route path="/embed/settings">{() => <EmbedPage view="settings" />}</Route>
        
        {/* Embed admin routes */}
        <Route path="/embed/admin">{() => <EmbedAdmin view="dashboard" />}</Route>
        <Route path="/embed/admin/avatars">{() => <EmbedAdmin view="avatars" />}</Route>
        <Route path="/embed/admin/knowledge">{() => <EmbedAdmin view="knowledge" />}</Route>
        <Route path="/embed/admin/courses">{() => <EmbedAdmin view="courses" />}</Route>
        <Route path="/embed/admin/users">{() => <EmbedAdmin view="users" />}</Route>
        <Route path="/embed/admin/analytics">{() => <EmbedAdmin view="analytics" />}</Route>
        <Route path="/embed/admin/credits">{() => <EmbedAdmin view="credits" />}</Route>
        
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
        <AuthSyncListener />
        <GlobalVideoNotifications />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
