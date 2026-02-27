import { DocumentUpload } from "@/components/DocumentUpload";
import { AvatarManager } from "@/components/AvatarManager";
import { DatabaseStatus } from "@/components/DatabaseStatus";
import { ServiceStatusCheck } from "@/components/ServiceStatusCheck";
import { TopicFolderUpload } from "@/components/TopicFolderUpload";
import { AvatarNamespaceMatrix } from "@/components/AvatarNamespaceMatrix";
import { PineconeNamespaceManager } from "@/components/PineconeNamespaceManager";
import { CourseIngestion } from "@/components/CourseIngestion";
import { PodcastIngestion } from "@/components/PodcastIngestion";
import { BatchPodcastIngestion } from "@/components/BatchPodcastIngestion";
import { LearningArtifactIngestion } from "@/components/LearningArtifactIngestion";
import CourseBuilderPage from "@/pages/course-builder";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LayoutDashboard, Users, FileText, Settings, Home, Video, Plus, Play, CreditCard, BarChart3, Menu, ChevronLeft, UserCog, Crown, Clock, Activity, Loader2, AlertCircle, Check, Trash2, ChevronUp, ChevronDown, Lock, FolderUp, Upload, Link2, GraduationCap, Mic, Brain } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { Link, useLocation, useSearch } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, hasAdminAccess, getAdminSecret } from "@/lib/queryClient";
import Credits from "@/pages/Credits";
import Analytics from "@/pages/Analytics";

export type AdminView = 'dashboard' | 'avatars' | 'knowledge' | 'courses' | 'users' | 'analytics' | 'credits' | 'settings';

const avatarGifs: Record<string, string> = {
  'mark-kohl': '/attached_assets/MArk-kohl-loop_1763964600000.gif',
  'willie-gault': '/attached_assets/Willie gault gif-low_1763964813725.gif',
  'june': '/attached_assets/June-low_1764106896823.gif',
  'thad': '/attached_assets/Thad_1763963906199.gif',
  'nigel': '/attached_assets/Nigel-Loop-avatar_1763964600000.gif',
  'ann': '/attached_assets/Ann_1763966361095.gif',
  'kelsey': '/attached_assets/Kelsey_1764111279103.gif',
  'judy': '/attached_assets/Screen Recording 2025-07-14 at 14.35.37-low_1764106921758.gif',
  'dexter': '/attached_assets/DexterDoctor-ezgif.com-loop-count_1764111811631.gif',
  'shawn': '/attached_assets/Screen Recording 2025-07-14 at 14.41.54-low_1764106970821.gif',
};

interface AdminProps {
  isEmbed?: boolean;
  embedView?: AdminView;
}

export default function Admin({ isEmbed = false, embedView }: AdminProps = {}) {
  const [currentView, setCurrentView] = useState<AdminView>(embedView || 'dashboard');
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [showCourseBuilder, setShowCourseBuilder] = useState(false);
  const [preSelectedAvatarId, setPreSelectedAvatarId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [adminSecretInput, setAdminSecretInput] = useState('');
  const [isAdminVerified, setIsAdminVerified] = useState(false);
  const [isVerifying, setIsVerifying] = useState(true);
  const { toast } = useToast();
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  
  // Check for admin access on mount - validate with server
  useEffect(() => {
    const verifyAdminAccess = async (secret: string) => {
      setIsVerifying(true);
      try {
        const response = await fetch('/api/admin/avatars', {
          headers: { 'X-Admin-Secret': secret },
        });
        if (response.ok) {
          setIsAdminVerified(true);
        } else {
          // Invalid secret - clear it
          localStorage.removeItem('admin_secret');
          setIsAdminVerified(false);
        }
      } catch {
        localStorage.removeItem('admin_secret');
        setIsAdminVerified(false);
      } finally {
        setIsVerifying(false);
      }
    };

    // Check URL params first and store in localStorage
    const urlParams = new URLSearchParams(searchString);
    const urlSecret = urlParams.get('admin_secret');
    if (urlSecret) {
      localStorage.setItem('admin_secret', urlSecret);
      verifyAdminAccess(urlSecret);
      // Remove secret from URL for security
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    } else if (hasAdminAccess()) {
      // Verify stored secret is still valid
      const storedSecret = getAdminSecret();
      if (storedSecret) {
        verifyAdminAccess(storedSecret);
      } else {
        setIsVerifying(false);
      }
    } else {
      setIsVerifying(false);
    }
  }, [searchString]);

  // Handle URL parameters for navigation
  const handleUrlParams = useCallback(() => {
    const urlParams = new URLSearchParams(searchString);
    const view = urlParams.get('view');
    const avatarId = urlParams.get('avatarId');
    
    if (view === 'courses') {
      setCurrentView('courses');
      if (avatarId) {
        setPreSelectedAvatarId(avatarId);
        setShowCourseBuilder(true);
      }
    }
  }, [searchString]);

  useEffect(() => {
    handleUrlParams();
  }, [handleUrlParams]);

  // Sync embedView when prop changes
  useEffect(() => {
    if (isEmbed && embedView) {
      setCurrentView(embedView);
    }
  }, [isEmbed, embedView]);

  // Auto-collapse sidebar on mobile
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setSidebarOpen(false);
      } else {
        setSidebarOpen(true);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const { data: avatarsData } = useQuery({
    queryKey: ['/api/admin/avatars'],
    enabled: isAdminVerified,
  });

  const { data: statsData } = useQuery({
    queryKey: ['/api/pinecone/stats'],
    enabled: isAdminVerified,
  });

  const { data: coursesData } = useQuery({
    queryKey: ['/api/courses'],
    enabled: isAdminVerified,
    refetchInterval: (query) => {
      // Poll every 5 seconds if any lesson is generating
      const data = query.state.data as any[] | undefined;
      const hasGenerating = data?.some((course: any) => 
        course.lessons?.some((lesson: any) => 
          lesson.status === "generating" || lesson.video?.status === "generating"
        )
      );
      return hasGenerating ? 5000 : false;
    },
  });

  const { data: chatVideosData } = useQuery({
    queryKey: ['/api/courses/chat-videos'],
    enabled: isAdminVerified,
    refetchInterval: 10000,
  });

  interface AdminUserStats {
    id: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    role: string;
    currentPlan: string;
    planSlug: string | null;
    subscriptionStatus: string | null;
    joinedAt: string | null;
    lastActiveAt: string | null;
    trialStartedAt: string | null;
    selectedAvatarId: string | null;
    usage: {
      videosCreated: number;
      coursesCreated: number;
      chatSessionsUsed: number;
      moodEntriesLogged: number;
      creditsUsed: number;
    };
  }

  const { data: usersData, isLoading: usersLoading } = useQuery<AdminUserStats[]>({
    queryKey: ['/api/admin/users'],
    enabled: isAdminVerified,
  });

  // Ingestion jobs queries
  interface LearningArtifactJob {
    id: string;
    status: string;
    kb: string;
    courseTitle: string;
    lessonsDetected: number;
    lessonsProcessed: number;
    totalArtifacts: number;
    createdAt: string;
    updatedAt: string;
  }

  interface PodcastBatch {
    id: string;
    namespace: string;
    zipFilename: string;
    status: string;
    totalEpisodes: number;
    processedEpisodes: number;
    successfulEpisodes: number;
    totalChunks: number;
    createdAt: string;
    updatedAt: string;
  }

  const getAdminHeaders = useCallback((): Record<string, string> => {
    const secret = localStorage.getItem('admin_secret');
    return secret ? { 'X-Admin-Secret': secret } : {};
  }, []);

  const { data: learningArtifactJobs } = useQuery<{ success: boolean; jobs: LearningArtifactJob[] }>({
    queryKey: ['/api/admin/learning-artifacts/jobs'],
    queryFn: async () => {
      const response = await fetch('/api/admin/learning-artifacts/jobs', {
        headers: getAdminHeaders()
      });
      if (!response.ok) throw new Error('Failed to fetch learning artifact jobs');
      return response.json();
    },
    enabled: isAdminVerified,
    refetchInterval: 10000,
  });

  const { data: podcastBatchesData } = useQuery<{ success: boolean; batches: PodcastBatch[] }>({
    queryKey: ['/api/admin/ingest/podcast/batches'],
    queryFn: async () => {
      const response = await fetch('/api/admin/ingest/podcast/batches', {
        headers: getAdminHeaders()
      });
      if (!response.ok) throw new Error('Failed to fetch podcast batches');
      return response.json();
    },
    enabled: isAdminVerified,
    refetchInterval: 10000,
  });

  const podcastBatches = podcastBatchesData?.batches || [];

  // Reorder avatars mutation
  const reorderMutation = useMutation({
    mutationFn: async (avatarIds: string[]) => {
      return apiRequest('/api/admin/avatars/reorder', 'POST', { avatarIds });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/avatars'] });
      queryClient.invalidateQueries({ queryKey: ['/api/avatars'] });
      toast({
        title: "Order updated",
        description: "Avatar display order has been saved.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update avatar order.",
        variant: "destructive",
      });
    },
  });

  const moveAvatarUp = (avatarId: string) => {
    if (!avatarsData || !Array.isArray(avatarsData)) return;
    const activeAvatars = avatarsData.filter((a: any) => a.isActive);
    const index = activeAvatars.findIndex((a: any) => a.id === avatarId);
    if (index <= 0) return;
    const newOrder = [...activeAvatars];
    [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
    reorderMutation.mutate(newOrder.map((a: any) => a.id));
  };

  const moveAvatarDown = (avatarId: string) => {
    if (!avatarsData || !Array.isArray(avatarsData)) return;
    const activeAvatars = avatarsData.filter((a: any) => a.isActive);
    const index = activeAvatars.findIndex((a: any) => a.id === avatarId);
    if (index < 0 || index >= activeAvatars.length - 1) return;
    const newOrder = [...activeAvatars];
    [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
    reorderMutation.mutate(newOrder.map((a: any) => a.id));
  };

  // Handle admin secret submission
  const handleAdminSecretSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminSecretInput.trim()) return;
    
    // Store the secret
    localStorage.setItem('admin_secret', adminSecretInput);
    
    // Test the secret by making an admin API call
    try {
      const res = await fetch('/api/admin/avatars', {
        headers: { 'X-Admin-Secret': adminSecretInput },
        credentials: 'include',
      });
      
      if (res.ok) {
        setIsAdminVerified(true);
        toast({
          title: "Access Granted",
          description: "Welcome to the admin panel.",
        });
        // Refresh queries with new secret
        queryClient.invalidateQueries();
      } else {
        localStorage.removeItem('admin_secret');
        toast({
          title: "Access Denied",
          description: "Invalid admin secret. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      localStorage.removeItem('admin_secret');
      toast({
        title: "Error",
        description: "Failed to verify admin access.",
        variant: "destructive",
      });
    }
  };
  
  if (isLoading || isVerifying) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" data-testid="loading-spinner"></div>
      </div>
    );
  }

  // Show admin secret input if not verified
  if (!isAdminVerified) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-b from-background to-muted" data-testid="admin-login">
        <Card className="w-full max-w-md mx-4">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <Lock className="w-6 h-6 text-primary" />
            </div>
            <CardTitle>Admin Access Required</CardTitle>
            <CardDescription>
              Enter the admin secret to access the admin panel.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAdminSecretSubmit} className="space-y-4">
              <Input
                type="password"
                placeholder="Admin Secret"
                value={adminSecretInput}
                onChange={(e) => setAdminSecretInput(e.target.value)}
                data-testid="input-admin-secret"
                autoFocus
              />
              <Button 
                type="submit" 
                className="w-full" 
                disabled={!adminSecretInput.trim()}
                data-testid="button-submit-admin-secret"
              >
                Access Admin Panel
              </Button>
              <div className="text-center">
                <Button 
                  variant="link" 
                  asChild
                  className="text-muted-foreground"
                >
                  <Link href="/">Back to Chat</Link>
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalAvatars = Array.isArray(avatarsData) ? avatarsData.filter((a: any) => a.isActive).length : 0;
  const totalDocuments = (statsData as any)?.success ? ((statsData as any).documents?.total || 0) : 0;
  const totalVectors = (statsData as any)?.success ? ((statsData as any).pinecone?.totalRecordCount || 0) : 0;

  const NavButton = ({ view, icon: Icon, label }: { view: AdminView; icon: any; label: string }) => (
    <Button
      variant={currentView === view ? 'default' : 'ghost'}
      className={`w-full justify-start transition-all duration-300 ${sidebarOpen ? '' : 'justify-center px-2'}`}
      onClick={() => {
        setCurrentView(view);
        if (window.innerWidth < 768) setSidebarOpen(false);
      }}
      data-testid={`nav-${view}`}
      title={!sidebarOpen ? label : undefined}
    >
      <Icon className={`w-4 h-4 ${sidebarOpen ? 'mr-3' : ''}`} />
      <span className={`transition-all duration-300 ${sidebarOpen ? 'opacity-100' : 'opacity-0 w-0 overflow-hidden'}`}>
        {label}
      </span>
    </Button>
  );

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Mobile Overlay - hidden in embed mode */}
      {!isEmbed && sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden transition-opacity duration-300"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - always visible */}
      <aside 
        className={`
          fixed md:relative z-50 h-full
          border-r bg-card/95 backdrop-blur-sm flex flex-col flex-shrink-0
          transition-all duration-300 ease-in-out
          ${sidebarOpen ? 'w-64 translate-x-0' : '-translate-x-full md:translate-x-0 md:w-16'}
        `}
      >
        <div className={`p-4 border-b flex items-center ${sidebarOpen ? 'justify-between' : 'justify-center'}`}>
          {sidebarOpen && (
            <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent transition-opacity duration-300">
              Admin Panel
            </h1>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="flex-shrink-0"
            data-testid="button-toggle-sidebar"
          >
            {sidebarOpen ? <ChevronLeft className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </Button>
        </div>
        
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          <NavButton view="dashboard" icon={LayoutDashboard} label="Dashboard" />
          <NavButton view="avatars" icon={Users} label="Avatars" />
          <NavButton view="knowledge" icon={FileText} label="Knowledge Base" />
          <NavButton view="courses" icon={Video} label="Video Courses" />
          <NavButton view="users" icon={UserCog} label="User Management" />
          <NavButton view="analytics" icon={BarChart3} label="Analytics" />
          <NavButton view="credits" icon={CreditCard} label="Credits" />
          <NavButton view="settings" icon={Settings} label="Settings" />
        </nav>

        <div className="p-2 border-t space-y-1">
          <Button
            variant="ghost"
            className={`w-full justify-start transition-all duration-300 ${sidebarOpen ? '' : 'justify-center px-2'}`}
            onClick={() => setLocation(isEmbed ? '/embed/dashboard' : '/')}
            data-testid="nav-home"
            title={!sidebarOpen ? "Back to Home" : undefined}
          >
            <Home className={`w-4 h-4 ${sidebarOpen ? 'mr-3' : ''}`} />
            <span className={`transition-all duration-300 ${sidebarOpen ? 'opacity-100' : 'opacity-0 w-0 overflow-hidden'}`}>
              Back to Home
            </span>
          </Button>
          <Button
            variant="ghost"
            className={`w-full justify-start text-orange-500 hover:text-orange-600 hover:bg-orange-500/10 transition-all duration-300 ${sidebarOpen ? '' : 'justify-center px-2'}`}
            onClick={() => {
              localStorage.removeItem('admin_secret');
              setIsAdminVerified(false);
              toast({ title: 'Admin secret cleared', description: 'Please re-enter your admin secret.' });
            }}
            data-testid="button-reset-admin-secret"
            title={!sidebarOpen ? "Reset Admin Secret" : undefined}
          >
            <Lock className={`w-4 h-4 ${sidebarOpen ? 'mr-3' : ''}`} />
            <span className={`transition-all duration-300 ${sidebarOpen ? 'opacity-100' : 'opacity-0 w-0 overflow-hidden'}`}>
              Reset Admin Secret
            </span>
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0 h-full overflow-y-auto transition-all duration-300">
        {/* Mobile Header with Menu Button - hidden in embed mode */}
        {!isEmbed && (
          <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-sm border-b md:hidden p-4">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSidebarOpen(true)}
                data-testid="button-open-sidebar-mobile"
              >
                <Menu className="w-5 h-5" />
              </Button>
              <h1 className="text-lg font-bold bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">
                Admin Panel
              </h1>
            </div>
          </div>
        )}

        <div className="p-4 sm:p-6 lg:p-8">
          {/* Header */}
          <div className="mb-6 sm:mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold mb-2">
              Welcome, <span className="text-primary">{user?.firstName || user?.email || 'Admin'}</span>
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground">
              {currentView === 'dashboard' && 'Track your progress, avatars & activity here'}
              {currentView === 'avatars' && 'Manage AI avatar personalities and configurations'}
              {currentView === 'knowledge' && 'Upload and manage knowledge base documents'}
              {currentView === 'courses' && 'Manage video courses and generated content'}
              {currentView === 'users' && 'Manage users, subscriptions, and track usage'}
              {currentView === 'analytics' && 'Analyze user trends and avatar interaction patterns'}
              {currentView === 'credits' && 'Monitor API credit usage across all services'}
              {currentView === 'settings' && 'Configure system settings and preferences'}
            </p>
          </div>

          {/* Dashboard View */}
          {currentView === 'dashboard' && (
            <>
              <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 mb-6 sm:mb-8">
                {/* Avatars Card */}
                <Card className="flex flex-col">
                  <CardHeader className="p-4 sm:p-6">
                    <CardTitle className="text-base sm:text-lg">Avatars</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 sm:p-6 pt-0 flex-1 flex flex-col">
                    <div className="flex items-center gap-2 mb-4">
                      {Array.isArray(avatarsData) && avatarsData.slice(0, 3).map((avatar: any) => (
                        <div 
                          key={avatar.id} 
                          className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center text-white font-semibold text-xs sm:text-sm"
                        >
                          {avatar.name.charAt(0)}
                        </div>
                      ))}
                      {totalAvatars > 3 && (
                        <div className="text-xs sm:text-sm text-muted-foreground">
                          +{totalAvatars - 3}
                        </div>
                      )}
                    </div>
                    <div className="mt-auto">
                      <Button 
                        className="w-full" 
                        variant="default"
                        onClick={() => setCurrentView('avatars')}
                        data-testid="button-view-avatars"
                      >
                        <Video className="w-4 h-4 mr-2" />
                        View Avatars
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Resources Card */}
                <Card className="flex flex-col">
                  <CardHeader className="p-4 sm:p-6">
                    <CardTitle className="text-base sm:text-lg">Resources</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 sm:p-6 pt-0 flex-1 flex flex-col">
                    <div className="space-y-2 flex-1">
                      <div className="flex justify-between items-center">
                        <span className="text-xs sm:text-sm text-muted-foreground">Documents</span>
                        <span className="text-xl sm:text-2xl font-bold">{totalDocuments}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs sm:text-sm text-muted-foreground">Vectors</span>
                        <span className="text-xl sm:text-2xl font-bold">{totalVectors}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Status Card */}
                <Card className="flex flex-col">
                  <CardHeader className="p-4 sm:p-6">
                    <CardTitle className="text-base sm:text-lg">Status</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 sm:p-6 pt-0 flex-1 flex flex-col">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-2 h-2 rounded-full bg-green-500"></div>
                      <span className="text-xs sm:text-sm">All Systems Operational</span>
                    </div>
                    <div className="mt-auto">
                      <Button 
                        variant="outline" 
                        className="w-full"
                        onClick={() => setCurrentView('settings')}
                      >
                        Settings
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Service Status Check */}
              <div className="mb-6 sm:mb-8">
                <ServiceStatusCheck />
              </div>

              {/* Ingestion Jobs Status */}
              <Card className="mb-6 sm:mb-8">
                <CardHeader className="p-4 sm:p-6">
                  <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                    <Upload className="w-5 h-5" />
                    Ingestion Jobs
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm">Track content uploads to knowledge base</CardDescription>
                </CardHeader>
                <CardContent className="p-4 sm:p-6 pt-0">
                  {/* Learning Artifact Jobs */}
                  <div className="mb-4">
                    <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                      <Brain className="w-4 h-4" />
                      Course Ingestion Jobs
                    </h4>
                    {learningArtifactJobs?.jobs && learningArtifactJobs.jobs.length > 0 ? (
                      <div className="space-y-2">
                        {learningArtifactJobs.jobs.slice(0, 5).map((job) => (
                          <div key={job.id} className="flex items-center justify-between p-2 border rounded text-xs sm:text-sm">
                            <div className="flex-1 min-w-0">
                              <div className="font-medium truncate">{job.courseTitle || 'Untitled Course'}</div>
                              <div className="text-muted-foreground">
                                {job.kb} • {job.lessonsProcessed}/{job.lessonsDetected} lessons • {job.totalArtifacts} artifacts
                              </div>
                            </div>
                            <div className={`px-2 py-1 rounded text-xs ${
                              job.status === 'completed' ? 'bg-green-500/20 text-green-500' :
                              job.status === 'processing' ? 'bg-blue-500/20 text-blue-500' :
                              job.status === 'failed' ? 'bg-red-500/20 text-red-500' :
                              'bg-yellow-500/20 text-yellow-500'
                            }`}>
                              {job.status}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs sm:text-sm text-muted-foreground">No course ingestion jobs</p>
                    )}
                  </div>

                  {/* Podcast Batch Jobs */}
                  <div>
                    <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                      <Mic className="w-4 h-4" />
                      Podcast Batch Jobs
                    </h4>
                    {podcastBatches && podcastBatches.length > 0 ? (
                      <div className="space-y-2">
                        {podcastBatches.slice(0, 5).map((batch) => (
                          <div key={batch.id} className="flex items-center justify-between p-2 border rounded text-xs sm:text-sm">
                            <div className="flex-1 min-w-0">
                              <div className="font-medium truncate">{batch.zipFilename}</div>
                              <div className="text-muted-foreground">
                                {batch.namespace} • {batch.processedEpisodes}/{batch.totalEpisodes} episodes • {batch.totalChunks} chunks
                              </div>
                            </div>
                            <div className={`px-2 py-1 rounded text-xs ${
                              batch.status === 'completed' ? 'bg-green-500/20 text-green-500' :
                              batch.status === 'processing' ? 'bg-blue-500/20 text-blue-500' :
                              batch.status === 'failed' ? 'bg-red-500/20 text-red-500' :
                              batch.status === 'cancelled' ? 'bg-gray-500/20 text-gray-500' :
                              'bg-yellow-500/20 text-yellow-500'
                            }`}>
                              {batch.status}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs sm:text-sm text-muted-foreground">No podcast batch jobs</p>
                    )}
                  </div>

                  <div className="mt-4 flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setCurrentView('knowledge')}
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      Upload Content
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Avatars Table */}
              <Card>
                <CardHeader className="p-4 sm:p-6">
                  <CardTitle className="text-base sm:text-lg">Active Avatars</CardTitle>
                  <CardDescription className="text-xs sm:text-sm">Manage your AI avatar personalities</CardDescription>
                </CardHeader>
                <CardContent className="p-4 sm:p-6 pt-0">
                  <div className="space-y-3">
                    {Array.isArray(avatarsData) && avatarsData.filter((a: any) => a.isActive).map((avatar: any) => (
                      <div 
                        key={avatar.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 border rounded-lg hover:bg-accent/50 transition-colors gap-3"
                      >
                        <div className="flex items-center gap-3 sm:gap-4">
                          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg overflow-hidden bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex-shrink-0">
                            {avatarGifs[avatar.id] ? (
                              <img 
                                src={avatarGifs[avatar.id]} 
                                alt={avatar.name}
                                className="w-full h-full object-cover"
                              />
                            ) : avatar.profileImageUrl ? (
                              <img 
                                src={avatar.profileImageUrl} 
                                alt={avatar.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-white font-semibold text-base sm:text-lg">
                                {avatar.name.charAt(0)}
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <h4 className="font-semibold text-sm sm:text-base">{avatar.name}</h4>
                            <p className="text-xs sm:text-sm text-muted-foreground line-clamp-1">
                              {avatar.description}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 justify-between sm:justify-end">
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0"
                              onClick={() => moveAvatarUp(avatar.id)}
                              disabled={reorderMutation.isPending || avatarsData.filter((a: any) => a.isActive).findIndex((a: any) => a.id === avatar.id) === 0}
                              data-testid={`button-move-up-${avatar.id}`}
                            >
                              <ChevronUp className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0"
                              onClick={() => moveAvatarDown(avatar.id)}
                              disabled={reorderMutation.isPending || avatarsData.filter((a: any) => a.isActive).findIndex((a: any) => a.id === avatar.id) === avatarsData.filter((a: any) => a.isActive).length - 1}
                              data-testid={`button-move-down-${avatar.id}`}
                            >
                              <ChevronDown className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-green-500"></div>
                            <span className="text-xs sm:text-sm text-green-600 dark:text-green-400">Active</span>
                          </div>
                          <Link href={`/?avatar=${avatar.id}`}>
                            <Button size="sm" variant="outline" data-testid={`button-chat-${avatar.id}`}>
                              Chat
                            </Button>
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {/* Avatars View */}
          {currentView === 'avatars' && (
            <Card>
              <CardHeader className="p-4 sm:p-6">
                <CardTitle>Avatar Management</CardTitle>
                <CardDescription>
                  Create and manage AI avatar personalities with unique configurations
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 sm:p-6 pt-0">
                <AvatarManager />
              </CardContent>
            </Card>
          )}

          {/* Knowledge Base View */}
          {currentView === 'knowledge' && (
            <div className="space-y-4 sm:space-y-6">
              <DatabaseStatus />
              
              <Tabs defaultValue="folders" className="w-full">
                <TabsList className="grid w-full grid-cols-7 mb-4">
                  <TabsTrigger value="folders" className="gap-2" data-testid="admin-tab-folders">
                    <FolderUp className="w-4 h-4" />
                    Folders
                  </TabsTrigger>
                  <TabsTrigger value="upload" className="gap-2" data-testid="admin-tab-upload">
                    <Upload className="w-4 h-4" />
                    Upload
                  </TabsTrigger>
                  <TabsTrigger value="courses" className="gap-2" data-testid="admin-tab-courses">
                    <GraduationCap className="w-4 h-4" />
                    Courses
                  </TabsTrigger>
                  <TabsTrigger value="podcasts" className="gap-2" data-testid="admin-tab-podcasts">
                    <Mic className="w-4 h-4" />
                    Podcasts
                  </TabsTrigger>
                  <TabsTrigger value="artifacts" className="gap-2" data-testid="admin-tab-artifacts">
                    <Brain className="w-4 h-4" />
                    Artifacts
                  </TabsTrigger>
                  <TabsTrigger value="mapping" className="gap-2" data-testid="admin-tab-mapping">
                    <Link2 className="w-4 h-4" />
                    Mapping
                  </TabsTrigger>
                  <TabsTrigger value="manage" className="gap-2" data-testid="admin-tab-manage">
                    <FileText className="w-4 h-4" />
                    Manage
                  </TabsTrigger>
                </TabsList>
                
                <TabsContent value="folders" className="space-y-4">
                  <TopicFolderUpload />
                </TabsContent>
                
                <TabsContent value="upload" className="space-y-4">
                  <Card>
                    <CardHeader className="p-4 sm:p-6">
                      <CardTitle>Upload Documents</CardTitle>
                      <CardDescription>
                        Upload individual documents to enhance AI avatar responses
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="p-4 sm:p-6 pt-0">
                      <DocumentUpload />
                    </CardContent>
                  </Card>
                </TabsContent>
                
                <TabsContent value="courses" className="space-y-4">
                  <CourseIngestion />
                </TabsContent>
                
                <TabsContent value="podcasts" className="space-y-4">
                  <Tabs defaultValue="single" className="w-full">
                    <TabsList className="glass-strong border border-white/10 mb-4">
                      <TabsTrigger value="single" className="gap-2" data-testid="podcast-tab-single">
                        <Mic className="w-4 h-4" />
                        Single Transcript
                      </TabsTrigger>
                      <TabsTrigger value="batch" className="gap-2" data-testid="podcast-tab-batch">
                        <Upload className="w-4 h-4" />
                        Batch Upload (ZIP)
                      </TabsTrigger>
                    </TabsList>
                    <TabsContent value="single">
                      <PodcastIngestion />
                    </TabsContent>
                    <TabsContent value="batch">
                      <BatchPodcastIngestion />
                    </TabsContent>
                  </Tabs>
                </TabsContent>
                
                <TabsContent value="artifacts" className="space-y-4">
                  <LearningArtifactIngestion />
                </TabsContent>
                
                <TabsContent value="mapping" className="space-y-4">
                  <AvatarNamespaceMatrix />
                </TabsContent>
                
                <TabsContent value="manage" className="space-y-4">
                  <PineconeNamespaceManager />
                </TabsContent>
              </Tabs>
            </div>
          )}

          {/* Courses View */}
          {currentView === 'courses' && !showCourseBuilder && (
            <div className="space-y-4 sm:space-y-6">
              {/* Chat-Generated Videos Section */}
              {Array.isArray(chatVideosData) && chatVideosData.length > 0 && (
                <Card className="border-purple-600/30">
                  <CardHeader className="p-4 sm:p-6 border-b bg-purple-950/20">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                      <div>
                        <CardTitle className="text-lg sm:text-xl flex items-center gap-2">
                          <Video className="w-5 h-5 text-purple-400" />
                          My Videos
                        </CardTitle>
                        <CardDescription className="mt-1 text-xs sm:text-sm">
                          Videos generated during chat conversations
                        </CardDescription>
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {chatVideosData.filter((v: any) => v.status === 'completed').length} completed
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 sm:p-6">
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {chatVideosData.map((video: any) => (
                        <div 
                          key={video.id}
                          className="border rounded-lg overflow-hidden hover:border-purple-600/50 transition-colors"
                          data-testid={`chat-video-card-${video.id}`}
                        >
                          {video.thumbnailUrl && (
                            <img 
                              src={video.thumbnailUrl}
                              alt={video.topic}
                              className="w-full h-32 object-cover"
                            />
                          )}
                          <div className="p-3 space-y-2">
                            <h4 className="font-semibold text-sm line-clamp-2">{video.topic}</h4>
                            <div className="flex items-center justify-between">
                              <span className={`text-xs px-2 py-1 rounded-full ${
                                video.status === 'completed' 
                                  ? 'bg-green-950/30 text-green-400 border border-green-600/30'
                                  : video.status === 'generating'
                                  ? 'bg-blue-950/30 text-blue-400 border border-blue-600/30 animate-pulse'
                                  : video.status === 'pending'
                                  ? 'bg-yellow-950/30 text-yellow-400 border border-yellow-600/30'
                                  : 'bg-red-950/30 text-red-400 border border-red-600/30'
                              }`}>
                                {video.status}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {video.avatarId}
                              </span>
                            </div>
                            {video.videoUrl && video.status === 'completed' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => window.open(video.videoUrl, "_blank")}
                                className="w-full mt-2"
                                data-testid={`button-play-chat-video-${video.id}`}
                              >
                                <Play className="w-4 h-4 mr-1" />
                                Play Video
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <h3 className="text-xl sm:text-2xl font-bold">Video Courses</h3>
                  <p className="text-sm text-muted-foreground">Manage all video courses and lessons</p>
                </div>
                <Button 
                  onClick={() => {
                    setEditingCourseId(null);
                    setShowCourseBuilder(true);
                  }}
                  className="w-full sm:w-auto"
                  data-testid="button-create-course"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Create New Course
                </Button>
              </div>

              {Array.isArray(coursesData) && coursesData.length > 0 ? (
                <div className="grid gap-4 sm:gap-6">
                  {coursesData.map((course: any) => (
                    <Card key={course.id} className="overflow-hidden">
                      <CardHeader className="border-b bg-card/50 p-4 sm:p-6">
                        <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                          <div className="flex-1 min-w-0">
                            <CardTitle className="text-lg sm:text-xl">{course.title}</CardTitle>
                            <CardDescription className="mt-1 text-xs sm:text-sm">
                              {course.description || 'No description'}
                            </CardDescription>
                            <div className="flex flex-wrap items-center gap-3 sm:gap-4 mt-3 text-xs sm:text-sm text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Video className="w-3 h-3 sm:w-4 sm:h-4" />
                                {course.lessons?.length || 0} lessons
                              </span>
                              <span className="flex items-center gap-1">
                                <Users className="w-3 h-3 sm:w-4 sm:h-4" />
                                Instructor: {course.avatarId || 'None'}
                              </span>
                            </div>
                          </div>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => {
                              setEditingCourseId(course.id);
                              setShowCourseBuilder(true);
                            }}
                            className="w-full sm:w-auto"
                            data-testid={`button-edit-course-${course.id}`}
                          >
                            Edit Course
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="p-4 sm:p-6">
                        {course.lessons && course.lessons.length > 0 ? (
                          <div className="space-y-3 sm:space-y-4">
                            {course.lessons.map((lesson: any) => (
                              <div 
                                key={lesson.id}
                                className="flex flex-col sm:flex-row items-start gap-3 sm:gap-4 p-3 sm:p-4 border rounded-lg hover:bg-accent/30 transition-colors"
                              >
                                {lesson.video?.thumbnailUrl && (
                                  <img 
                                    src={lesson.video.thumbnailUrl}
                                    alt={lesson.title}
                                    className="w-full sm:w-32 h-32 sm:h-20 object-cover rounded border"
                                  />
                                )}
                                <div className="flex-1 min-w-0">
                                  <h4 className="font-semibold text-sm sm:text-base">{lesson.title}</h4>
                                  <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2 mt-1">
                                    {lesson.script || 'No script'}
                                  </p>
                                  <div className="flex items-center gap-3 mt-2">
                                    <span className={`text-xs px-2 py-1 rounded-full ${
                                      lesson.status === 'completed' 
                                        ? 'bg-green-950/30 text-green-400 border border-green-600/30'
                                        : lesson.status === 'generating'
                                        ? 'bg-blue-950/30 text-blue-400 border border-blue-600/30'
                                        : lesson.status === 'failed'
                                        ? 'bg-red-950/30 text-red-400 border border-red-600/30'
                                        : 'bg-gray-950/30 text-gray-400 border border-gray-600/30'
                                    }`}>
                                      {lesson.status}
                                    </span>
                                    {lesson.video?.duration && (
                                      <span className="text-xs text-muted-foreground">
                                        {lesson.video.duration}s
                                      </span>
                                    )}
                                  </div>
                                </div>
                                {lesson.video?.videoUrl && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => window.open(lesson.video.videoUrl, "_blank")}
                                    className="w-full sm:w-auto"
                                    data-testid={`button-play-video-${lesson.id}`}
                                  >
                                    <Play className="w-4 h-4 mr-1" />
                                    Play
                                  </Button>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-center text-muted-foreground py-6 sm:py-8 text-sm">
                            No lessons in this course yet
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="py-8 sm:py-12 text-center">
                    <Video className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="text-base sm:text-lg font-semibold mb-2">No courses yet</h3>
                    <p className="text-sm text-muted-foreground mb-6">
                      Create your first video course to get started
                    </p>
                    <Button 
                      onClick={() => {
                        setEditingCourseId(null);
                        setShowCourseBuilder(true);
                      }}
                      data-testid="button-create-first-course"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Create Course
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Course Builder View */}
          {currentView === 'courses' && showCourseBuilder && (
            <CourseBuilderPage 
              isEmbedded 
              courseId={editingCourseId}
              preSelectedAvatarId={preSelectedAvatarId}
              onBack={() => {
                setShowCourseBuilder(false);
                setEditingCourseId(null);
                setPreSelectedAvatarId(null);
              }}
            />
          )}

          {/* Users Management View */}
          {currentView === 'users' && (
            <div className="space-y-6">
              {/* Summary Stats */}
              <div className="grid gap-4 sm:gap-6 grid-cols-1 md:grid-cols-4">
                <Card className="bg-gradient-to-br from-purple-500/10 to-transparent border-purple-500/20">
                  <CardContent className="p-4 sm:p-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-purple-500/20">
                        <Users className="w-5 h-5 text-purple-400" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">{usersData?.length || 0}</p>
                        <p className="text-sm text-muted-foreground">Total Users</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-green-500/10 to-transparent border-green-500/20">
                  <CardContent className="p-4 sm:p-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-green-500/20">
                        <Crown className="w-5 h-5 text-green-400" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">
                          {usersData?.filter(u => u.planSlug === 'pro').length || 0}
                        </p>
                        <p className="text-sm text-muted-foreground">Pro Users</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-blue-500/10 to-transparent border-blue-500/20">
                  <CardContent className="p-4 sm:p-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-blue-500/20">
                        <CreditCard className="w-5 h-5 text-blue-400" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">
                          {usersData?.filter(u => u.planSlug === 'basic').length || 0}
                        </p>
                        <p className="text-sm text-muted-foreground">Basic Users</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-yellow-500/10 to-transparent border-yellow-500/20">
                  <CardContent className="p-4 sm:p-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-yellow-500/20">
                        <Clock className="w-5 h-5 text-yellow-400" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">
                          {usersData?.filter(u => u.subscriptionStatus === 'trial').length || 0}
                        </p>
                        <p className="text-sm text-muted-foreground">Active Trials</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Users Table */}
              <Card>
                <CardHeader className="p-4 sm:p-6">
                  <CardTitle className="flex items-center gap-2">
                    <UserCog className="w-5 h-5" />
                    All Users
                  </CardTitle>
                  <CardDescription>
                    Manage user subscriptions, roles, and view usage statistics
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4 sm:p-6 pt-0">
                  {usersLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
                    </div>
                  ) : usersData && usersData.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-3 px-2 font-medium text-muted-foreground">User</th>
                            <th className="text-left py-3 px-2 font-medium text-muted-foreground">Plan</th>
                            <th className="text-left py-3 px-2 font-medium text-muted-foreground">Status</th>
                            <th className="text-left py-3 px-2 font-medium text-muted-foreground">Role</th>
                            <th className="text-left py-3 px-2 font-medium text-muted-foreground">Avatar</th>
                            <th className="text-left py-3 px-2 font-medium text-muted-foreground">Usage</th>
                            <th className="text-left py-3 px-2 font-medium text-muted-foreground">Joined</th>
                          </tr>
                        </thead>
                        <tbody>
                          {usersData.map((userData) => (
                            <tr key={userData.id} className="border-b hover:bg-muted/50 transition-colors">
                              <td className="py-3 px-2">
                                <div>
                                  <p className="font-medium">
                                    {userData.firstName || userData.lastName 
                                      ? `${userData.firstName || ''} ${userData.lastName || ''}`.trim()
                                      : userData.email || 'Unknown'}
                                  </p>
                                  <p className="text-xs text-muted-foreground">{userData.email}</p>
                                </div>
                              </td>
                              <td className="py-3 px-2">
                                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                                  userData.planSlug === 'pro' ? 'bg-purple-500/20 text-purple-300' :
                                  userData.planSlug === 'basic' ? 'bg-blue-500/20 text-blue-300' :
                                  userData.planSlug === 'free' ? 'bg-yellow-500/20 text-yellow-300' :
                                  'bg-gray-500/20 text-gray-300'
                                }`}>
                                  {userData.planSlug === 'pro' && <Crown className="w-3 h-3" />}
                                  {userData.currentPlan}
                                </span>
                              </td>
                              <td className="py-3 px-2">
                                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                                  userData.subscriptionStatus === 'active' ? 'bg-green-500/20 text-green-300' :
                                  userData.subscriptionStatus === 'trial' ? 'bg-yellow-500/20 text-yellow-300' :
                                  userData.subscriptionStatus === 'expired' ? 'bg-red-500/20 text-red-300' :
                                  'bg-gray-500/20 text-gray-300'
                                }`}>
                                  {userData.subscriptionStatus === 'active' && <Check className="w-3 h-3" />}
                                  {userData.subscriptionStatus === 'trial' && <Clock className="w-3 h-3" />}
                                  {userData.subscriptionStatus === 'expired' && <AlertCircle className="w-3 h-3" />}
                                  {userData.subscriptionStatus || 'None'}
                                </span>
                              </td>
                              <td className="py-3 px-2">
                                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                                  userData.role === 'admin' ? 'bg-red-500/20 text-red-300' : 'bg-gray-500/20 text-gray-300'
                                }`}>
                                  {userData.role === 'admin' && <Crown className="w-3 h-3" />}
                                  {userData.role}
                                </span>
                              </td>
                              <td className="py-3 px-2">
                                {userData.selectedAvatarId ? (
                                  <div className="flex items-center gap-2">
                                    {avatarGifs[userData.selectedAvatarId] && (
                                      <img 
                                        src={avatarGifs[userData.selectedAvatarId]} 
                                        alt="Avatar" 
                                        className="w-6 h-6 rounded-full object-cover"
                                      />
                                    )}
                                    <span className="text-xs">{userData.selectedAvatarId}</span>
                                  </div>
                                ) : (
                                  <span className="text-xs text-muted-foreground">-</span>
                                )}
                              </td>
                              <td className="py-3 px-2">
                                <div className="flex flex-wrap gap-1">
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300 text-xs" title="Videos">
                                    <Video className="w-3 h-3" /> {userData.usage?.videosCreated ?? 0}
                                  </span>
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-300 text-xs" title="Courses">
                                    📚 {userData.usage?.coursesCreated ?? 0}
                                  </span>
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-500/10 text-green-300 text-xs" title="Chats">
                                    💬 {userData.usage?.chatSessionsUsed ?? 0}
                                  </span>
                                </div>
                              </td>
                              <td className="py-3 px-2 text-xs text-muted-foreground">
                                {userData.joinedAt 
                                  ? new Date(userData.joinedAt).toLocaleDateString()
                                  : '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <Users className="w-12 h-12 text-muted-foreground mb-4" />
                      <h3 className="font-medium text-lg">No Users Found</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Users will appear here as they sign up
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Analytics View */}
          {currentView === 'analytics' && <Analytics />}

          {/* Credits View */}
          {currentView === 'credits' && <Credits />}

          {/* Settings View */}
          {currentView === 'settings' && (
            <Card>
              <CardHeader className="p-4 sm:p-6">
                <CardTitle>Settings</CardTitle>
                <CardDescription>
                  Configure system preferences and account settings
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 sm:p-6 pt-0">
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 border rounded-lg gap-3">
                    <div>
                      <h4 className="font-medium">Account</h4>
                      <p className="text-sm text-muted-foreground">
                        Signed in as {user?.email || 'User'}
                      </p>
                    </div>
                    <Link href="/account">
                      <Button variant="outline" size="sm" className="w-full sm:w-auto">
                        Manage Account
                      </Button>
                    </Link>
                  </div>
                  
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 border rounded-lg gap-3">
                    <div>
                      <h4 className="font-medium">System Status</h4>
                      <p className="text-sm text-muted-foreground">
                        All services operational
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-green-500"></div>
                      <span className="text-sm text-green-600 dark:text-green-400">Active</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
