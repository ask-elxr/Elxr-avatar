import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  MessageSquare, 
  Video, 
  Settings, 
  Home, 
  LogOut, 
  Sparkles, 
  LayoutDashboard, 
  Menu, 
  ChevronLeft,
  Download,
  Clock,
  CheckCircle,
  Loader2,
  AlertCircle,
  Play,
  Shield,
  Users,
  Database,
  Check,
  CreditCard,
  BookOpen,
  Plus,
  User,
  Trash2,
  DollarSign,
  TrendingUp,
  Activity,
  Heart,
  Smile,
  Frown,
  Meh,
  Zap,
  Sun,
  CloudRain
} from "lucide-react";
import { Link, useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect, useCallback } from "react";
import { formatDistanceToNow } from "date-fns";
import type { AvatarProfile, Course, ChatGeneratedVideo, Lesson, GeneratedVideo, MoodEntry, MoodType, moodTypeEnum } from "@shared/schema";
import { Badge } from "@/components/ui/badge";

// Extended type for courses with lessons and video data from API
interface LessonWithVideo extends Lesson {
  video: GeneratedVideo | null;
}

interface CourseWithLessons extends Course {
  lessons: LessonWithVideo[];
}
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell, LineChart, Line } from "recharts";
import CourseBuilderPage from "./course-builder";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { useMutation } from "@tanstack/react-query";

type UserView = 'dashboard' | 'chat' | 'videos' | 'courses' | 'course-view' | 'course-edit' | 'credits' | 'settings' | 'mood';

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

interface ChatVideo {
  id: number;
  sessionId: string;
  avatarId: string;
  topic: string;
  script: string | null;
  videoUrl: string | null;
  heygenVideoId: string | null;
  status: string;
  createdAt: string;
  updatedAt: string | null;
  completedAt: string | null;
}

interface CreditStats {
  limit: number;
  totalUsed: number;
  remaining: number;
  last24h: number;
  last7d: number;
  warningThreshold: number;
  criticalThreshold: number;
  status: 'ok' | 'warning' | 'critical';
}

export default function Dashboard() {
  const { isAuthenticated, isLoading, user, isAdmin } = useAuth();
  const [currentView, setCurrentView] = useState<UserView>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [, setLocation] = useLocation();
  const searchString = useSearch();

  const { data: chatVideos, isLoading: videosLoading } = useQuery<ChatVideo[]>({
    queryKey: ['/api/courses/chat-videos'],
    enabled: isAuthenticated,
  });

  const { data: avatars, isLoading: avatarsLoading } = useQuery<AvatarProfile[]>({
    queryKey: ['/api/avatars'],
  });

  const { data: courses, isLoading: coursesLoading } = useQuery<CourseWithLessons[]>({
    queryKey: ['/api/courses'],
    enabled: isAuthenticated,
  });

  const { data: moodEntries, isLoading: moodLoading, refetch: refetchMood } = useQuery<MoodEntry[]>({
    queryKey: ['/api/mood'],
    enabled: isAuthenticated,
  });

  const { data: heygenStats, isLoading: creditsLoading } = useQuery<CreditStats>({
    queryKey: ['/api/heygen/credits'],
    enabled: isAuthenticated,
    refetchInterval: 30000,
  });

  const { toast } = useToast();
  const [selectedAvatarId, setSelectedAvatarId] = useState<string>("");
  const [selectedVideo, setSelectedVideo] = useState<ChatVideo | null>(null);
  const [deletingVideoId, setDeletingVideoId] = useState<string | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  
  const [selectedMood, setSelectedMood] = useState<MoodType | null>(null);
  const [moodIntensity, setMoodIntensity] = useState<number>(3);
  const [moodNotes, setMoodNotes] = useState<string>("");
  const [lastMoodResponse, setLastMoodResponse] = useState<{ mood: string; response: string } | null>(null);

  const moodMutation = useMutation({
    mutationFn: async (data: { mood: MoodType; intensity: number; notes?: string; avatarId?: string }) => {
      const response = await apiRequest('/api/mood', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return response;
    },
    onSuccess: (data: MoodEntry) => {
      setLastMoodResponse({ mood: data.mood, response: data.avatarResponse || "" });
      setSelectedMood(null);
      setMoodIntensity(3);
      setMoodNotes("");
      queryClient.invalidateQueries({ queryKey: ['/api/mood'] });
      toast({ title: "Mood logged!", description: "Your emotional wellness has been recorded." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to log your mood. Please try again.", variant: "destructive" });
    }
  });

  const completedVideos = chatVideos?.filter((v) => v.status === 'completed') || [];
  const pendingVideos = chatVideos?.filter((v) => v.status === 'pending' || v.status === 'generating') || [];
  const failedVideos = chatVideos?.filter((v) => v.status === 'failed') || [];

  const handleUrlParams = useCallback(() => {
    const urlParams = new URLSearchParams(searchString);
    const view = urlParams.get('view');
    if (view === 'videos' || view === 'settings' || view === 'chat' || view === 'courses' || view === 'credits') {
      setCurrentView(view);
    }
  }, [searchString]);

  useEffect(() => {
    handleUrlParams();
  }, [handleUrlParams]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setSidebarOpen(false);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background dot-pattern flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-gradient-primary glow-primary flex items-center justify-center mx-auto mb-4 animate-pulse">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          <p className="text-white/70">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background dot-pattern flex items-center justify-center">
        <Card className="w-full max-w-md glass-strong border-purple-500/30">
          <CardHeader className="text-center">
            <div className="w-16 h-16 rounded-full bg-gradient-primary glow-primary flex items-center justify-center mx-auto mb-4">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
            <CardTitle className="text-white">Sign In Required</CardTitle>
            <CardDescription className="text-white/60">
              Please sign in to access your dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button asChild>
              <a href="/api/login">Sign In</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const NavButton = ({ view, icon: Icon, label, onClick, isActive }: { view?: UserView; icon: any; label: string; onClick?: () => void; isActive?: boolean }) => (
    <Button
      variant={isActive !== undefined ? (isActive ? 'default' : 'ghost') : (view && currentView === view ? 'default' : 'ghost')}
      className={`w-full justify-start transition-all duration-300 ${sidebarOpen ? '' : 'justify-center px-2'}`}
      onClick={() => {
        if (onClick) {
          onClick();
        } else if (view) {
          setCurrentView(view);
        }
        if (window.innerWidth < 768) setSidebarOpen(false);
      }}
      data-testid={`nav-${view || label.toLowerCase().replace(' ', '-')}`}
      title={!sidebarOpen ? label : undefined}
    >
      <Icon className={`w-4 h-4 ${sidebarOpen ? 'mr-3' : ''}`} />
      <span className={`transition-all duration-300 ${sidebarOpen ? 'opacity-100' : 'opacity-0 w-0 overflow-hidden'}`}>
        {label}
      </span>
    </Button>
  );

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-400" />;
      case 'generating':
        return <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />;
      case 'pending':
        return <Clock className="w-4 h-4 text-yellow-400" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-red-400" />;
      default:
        return <Clock className="w-4 h-4 text-white/50" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed':
        return 'Ready to watch';
      case 'generating':
        return 'Generating...';
      case 'pending':
        return 'Pending';
      case 'failed':
        return 'Failed';
      default:
        return status;
    }
  };

  return (
    <div className="flex h-screen bg-background dot-pattern overflow-hidden">
      {/* Floating orbs for ambiance */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-purple-500/20 rounded-full blur-[100px] animate-float" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-cyan-500/20 rounded-full blur-[120px] animate-float-delayed" />
      </div>

      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden transition-opacity duration-300"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside 
        className={`
          fixed md:relative z-50 h-full
          border-r border-white/10 glass-strong flex flex-col flex-shrink-0
          transition-all duration-300 ease-in-out
          ${sidebarOpen ? 'w-64 translate-x-0' : '-translate-x-full md:translate-x-0 md:w-16'}
        `}
      >
        <div className={`p-4 border-b border-white/10 flex items-center ${sidebarOpen ? 'justify-between' : 'justify-center'}`}>
          {sidebarOpen && (
            <h1 className="text-xl font-bold bg-gradient-to-r from-purple-400 via-cyan-400 to-purple-400 bg-clip-text text-transparent transition-opacity duration-300">
              My Dashboard
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
          <NavButton view="chat" icon={MessageSquare} label="Avatar Chat" />
          <NavButton view="videos" icon={Video} label="My Videos" />
          <NavButton view="courses" icon={BookOpen} label="Video Courses" />
          <NavButton view="mood" icon={Heart} label="Mood Tracker" />
          <NavButton view="credits" icon={CreditCard} label="Credits" />
          <NavButton view="settings" icon={Settings} label="Settings" />
        </nav>

        <div className="p-2 border-t border-white/10 space-y-1">
          {isAdmin && (
            <Button
              variant="ghost"
              className={`w-full justify-start transition-all duration-300 ${sidebarOpen ? '' : 'justify-center px-2'}`}
              onClick={() => setLocation('/admin')}
              data-testid="nav-admin"
              title={!sidebarOpen ? "Admin Panel" : undefined}
            >
              <Shield className={`w-4 h-4 ${sidebarOpen ? 'mr-3' : ''} text-purple-400`} />
              <span className={`transition-all duration-300 ${sidebarOpen ? 'opacity-100' : 'opacity-0 w-0 overflow-hidden'}`}>
                Admin Panel
              </span>
            </Button>
          )}
          
          <Button
            variant="ghost"
            className={`w-full justify-start transition-all duration-300 ${sidebarOpen ? '' : 'justify-center px-2'}`}
            onClick={() => setLocation('/')}
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
            className={`w-full justify-start text-red-400 hover:text-red-300 transition-all duration-300 ${sidebarOpen ? '' : 'justify-center px-2'}`}
            asChild
            data-testid="nav-logout"
            title={!sidebarOpen ? "Logout" : undefined}
          >
            <a href="/api/logout">
              <LogOut className={`w-4 h-4 ${sidebarOpen ? 'mr-3' : ''}`} />
              <span className={`transition-all duration-300 ${sidebarOpen ? 'opacity-100' : 'opacity-0 w-0 overflow-hidden'}`}>
                Logout
              </span>
            </a>
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0 h-full overflow-y-auto transition-all duration-300">
        {/* Mobile Header with Menu Button */}
        <div className="sticky top-0 z-30 glass-strong border-b border-white/10 md:hidden p-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(true)}
              data-testid="button-open-sidebar-mobile"
            >
              <Menu className="w-5 h-5" />
            </Button>
            <h1 className="text-lg font-bold bg-gradient-to-r from-purple-400 via-cyan-400 to-purple-400 bg-clip-text text-transparent">
              My Dashboard
            </h1>
          </div>
        </div>

        <div className="p-4 sm:p-6 lg:p-8">
          {/* Header */}
          <div className="mb-6 sm:mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold mb-2 text-white">
              Welcome, <span className="bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">{user?.firstName || user?.email || 'User'}</span>
            </h2>
            <p className="text-sm sm:text-base text-white/60">
              {currentView === 'dashboard' && 'Your personal dashboard - chat with avatars and view your videos'}
              {currentView === 'chat' && 'Choose an AI avatar to start a conversation'}
              {currentView === 'videos' && 'Videos generated from your chat conversations'}
              {currentView === 'courses' && 'Create and manage video courses with AI avatars'}
              {currentView === 'course-view' && 'Watch your course videos'}
              {currentView === 'course-edit' && 'Edit your video course'}
              {currentView === 'credits' && 'Track your API credit usage across services'}
              {currentView === 'mood' && 'Track your emotional wellness and get personalized support'}
              {currentView === 'settings' && 'Manage your account settings'}
            </p>
          </div>

          {/* Dashboard View */}
          {currentView === 'dashboard' && (
            <>
              {/* Quick Stats */}
              <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 mb-6 sm:mb-8">
                {/* Avatar Chat Card */}
                <Card className="relative glass-strong border-purple-500/20 hover:border-purple-500/40 transition-all duration-300 group card-hover">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                  <CardHeader className="p-4 sm:p-6">
                    <CardTitle className="flex items-center gap-3 text-base sm:text-lg text-white">
                      <div className="w-10 h-10 rounded-lg bg-gradient-primary flex items-center justify-center glow-primary group-hover:scale-110 transition-transform">
                        <MessageSquare className="w-5 h-5 text-white" />
                      </div>
                      Avatar Chat
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 sm:p-6 pt-0">
                    <p className="text-sm text-white/60 mb-4">
                      Start a conversation with AI avatars and get personalized responses.
                    </p>
                    <Button 
                      className="w-full" 
                      onClick={() => setLocation('/')}
                      data-testid="button-start-chat"
                    >
                      <MessageSquare className="w-4 h-4 mr-2" />
                      Start Chatting
                    </Button>
                  </CardContent>
                </Card>

                {/* My Videos Card */}
                <Card className="relative glass-strong border-cyan-500/20 hover:border-cyan-500/40 transition-all duration-300 group card-hover">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-500 to-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <CardHeader className="p-4 sm:p-6">
                    <CardTitle className="flex items-center gap-3 text-base sm:text-lg text-white">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 flex items-center justify-center glow-secondary group-hover:scale-110 transition-transform">
                        <Video className="w-5 h-5 text-white" />
                      </div>
                      My Videos
                      {completedVideos.length > 0 && (
                        <span className="ml-auto text-xs glass-strong border-cyan-500/30 text-cyan-300 px-2 py-0.5 rounded-full">
                          {completedVideos.length}
                        </span>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 sm:p-6 pt-0">
                    <p className="text-sm text-white/60 mb-4">
                      View and download videos generated from your conversations.
                    </p>
                    <div className="flex items-center gap-2">
                      <Button 
                        className="flex-1" 
                        variant="secondary"
                        onClick={() => setCurrentView('videos')}
                        data-testid="button-view-videos"
                      >
                        <Video className="w-4 h-4 mr-2" />
                        View Videos
                      </Button>
                      {pendingVideos.length > 0 && (
                        <span className="text-xs text-yellow-400 flex items-center gap-1">
                          <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                          {pendingVideos.length}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Stats Card */}
                <Card className="relative glass-strong border-green-500/20 hover:border-green-500/40 transition-all duration-300 group card-hover">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-green-500 to-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <CardHeader className="p-4 sm:p-6">
                    <CardTitle className="flex items-center gap-3 text-base sm:text-lg text-white">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-r from-green-500 to-emerald-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <Sparkles className="w-5 h-5 text-white" />
                      </div>
                      Your Stats
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 sm:p-6 pt-0">
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-white/60">Completed Videos</span>
                        <span className="text-xl font-bold text-green-400">{completedVideos.length}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-white/60">In Progress</span>
                        <span className="text-xl font-bold text-cyan-400">{pendingVideos.length}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Features Overview */}
              <h3 className="text-lg font-semibold text-white mb-4">Features</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                <Card className="glass border-white/10 hover:border-purple-500/30 transition-all duration-300 group">
                  <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-3">
                    <CardTitle className="flex items-center space-x-2 text-sm sm:text-base text-white">
                      <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center group-hover:bg-gradient-primary transition-all">
                        <MessageSquare className="w-4 h-4 text-blue-400 group-hover:text-white transition-colors" />
                      </div>
                      <span>AI Conversations</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6 pt-0">
                    <p className="text-xs sm:text-sm text-white/60">
                      Have natural voice and text conversations with personalized AI avatars.
                    </p>
                  </CardContent>
                </Card>

                <Card className="glass border-white/10 hover:border-cyan-500/30 transition-all duration-300 group">
                  <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-3">
                    <CardTitle className="flex items-center space-x-2 text-sm sm:text-base text-white">
                      <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center group-hover:bg-gradient-primary transition-all">
                        <Video className="w-4 h-4 text-purple-400 group-hover:text-white transition-colors" />
                      </div>
                      <span>Video Generation</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6 pt-0">
                    <p className="text-xs sm:text-sm text-white/60">
                      Request custom videos during chat - just ask the avatar to make a video.
                    </p>
                  </CardContent>
                </Card>

                <Card className="glass border-white/10 hover:border-green-500/30 transition-all duration-300 group">
                  <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-3">
                    <CardTitle className="flex items-center space-x-2 text-sm sm:text-base text-white">
                      <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center group-hover:bg-gradient-to-r group-hover:from-green-500 group-hover:to-emerald-500 transition-all">
                        <Database className="w-4 h-4 text-green-400 group-hover:text-white transition-colors" />
                      </div>
                      <span>Knowledge Base</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6 pt-0">
                    <p className="text-xs sm:text-sm text-white/60">
                      Avatars access specialized knowledge for accurate, contextual responses.
                    </p>
                  </CardContent>
                </Card>

                <Card className="glass border-white/10 hover:border-orange-500/30 transition-all duration-300 group">
                  <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-3">
                    <CardTitle className="flex items-center space-x-2 text-sm sm:text-base text-white">
                      <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center group-hover:bg-gradient-to-r group-hover:from-orange-500 group-hover:to-amber-500 transition-all">
                        <Users className="w-4 h-4 text-orange-400 group-hover:text-white transition-colors" />
                      </div>
                      <span>Multiple Avatars</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6 pt-0">
                    <p className="text-xs sm:text-sm text-white/60">
                      Choose from various AI avatars, each with unique expertise.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </>
          )}

          {/* Chat View - Avatar Selection */}
          {currentView === 'chat' && (
            <>
              {avatarsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <div className="w-12 h-12 rounded-full bg-gradient-primary glow-primary flex items-center justify-center mx-auto mb-4 animate-pulse">
                      <Loader2 className="w-6 h-6 text-white animate-spin" />
                    </div>
                    <p className="text-white/60">Loading avatars...</p>
                  </div>
                </div>
              ) : !avatars || avatars.length === 0 ? (
                <Card className="max-w-lg mx-auto glass-strong border-purple-500/30">
                  <CardHeader className="text-center">
                    <div className="w-16 h-16 rounded-full bg-gradient-primary/20 flex items-center justify-center mx-auto mb-4">
                      <Users className="w-8 h-8 text-purple-400" />
                    </div>
                    <CardTitle className="text-white">No Avatars Available</CardTitle>
                    <CardDescription className="text-white/60">
                      There are no AI avatars configured at the moment. Please check back later.
                    </CardDescription>
                  </CardHeader>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                  {avatars.map((avatar) => (
                    <Card
                      key={avatar.id}
                      onClick={() => setSelectedAvatarId(avatar.id)}
                      className={`cursor-pointer transition-all duration-300 flex flex-col h-full glass-strong group card-hover ${
                        selectedAvatarId === avatar.id
                          ? "border-purple-500/50 ring-2 ring-purple-500/30"
                          : "border-white/10 hover:border-purple-500/30"
                      }`}
                      data-testid={`card-avatar-${avatar.id}`}
                    >
                      <CardHeader className="p-4 md:p-5 flex-1 flex flex-col">
                        <div className="flex flex-col h-full">
                          {/* Avatar Image/GIF */}
                          <div className="w-full aspect-square rounded-lg overflow-hidden bg-gradient-to-br from-purple-500/20 to-cyan-500/20 flex items-center justify-center mb-4 group-hover:scale-[1.02] transition-transform">
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
                              <div className="w-full h-full bg-gradient-to-br from-purple-600 to-cyan-600 flex items-center justify-center text-white font-bold text-4xl">
                                {avatar.name.charAt(0)}
                              </div>
                            )}
                          </div>

                          {/* Content */}
                          <div className="relative flex-1 flex flex-col">
                            <div className="pr-10 flex-1 flex flex-col">
                              {/* Name */}
                              <CardTitle className="text-white text-lg md:text-xl mb-2">
                                {avatar.name}
                              </CardTitle>
                              
                              {/* Description */}
                              <CardDescription className="text-white/60 text-xs md:text-sm mb-3 line-clamp-3 min-h-[3.5rem]">
                                {avatar.description}
                              </CardDescription>
                              
                              {/* Tags */}
                              <div className="flex flex-wrap gap-1.5 mb-4 min-h-[2.5rem]">
                                {avatar.tags && avatar.tags.length > 0 && avatar.tags.slice(0, 3).map((tag, index) => (
                                  <span
                                    key={index}
                                    className="text-xs px-2 py-0.5 bg-purple-500/20 text-purple-300 rounded-full border border-purple-500/30 h-fit"
                                  >
                                    {tag}
                                  </span>
                                ))}
                              </div>

                              {/* Start Chat Button */}
                              <div className="mt-auto">
                                <Button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setLocation(`/?avatar=${avatar.id}`);
                                  }}
                                  className="w-full bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-700 hover:to-cyan-700 text-white font-semibold py-2.5 text-sm rounded-lg transition-all duration-200 hover:scale-[1.02] shadow-lg shadow-purple-500/20"
                                  data-testid={`button-chat-${avatar.id}`}
                                >
                                  <MessageSquare className="w-4 h-4 mr-2" />
                                  Start Chat
                                </Button>
                              </div>
                            </div>

                            {/* Selection Check Mark */}
                            {selectedAvatarId === avatar.id && (
                              <div className="absolute top-0 right-0 w-7 h-7 rounded-full bg-gradient-primary flex items-center justify-center glow-primary">
                                <Check className="w-4 h-4 text-white" />
                              </div>
                            )}
                          </div>
                        </div>
                      </CardHeader>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Videos View */}
          {currentView === 'videos' && (
            <>
              {videosLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <div className="w-12 h-12 rounded-full bg-gradient-primary glow-primary flex items-center justify-center mx-auto mb-4 animate-pulse">
                      <Loader2 className="w-6 h-6 text-white animate-spin" />
                    </div>
                    <p className="text-white/60">Loading your videos...</p>
                  </div>
                </div>
              ) : !chatVideos || chatVideos.length === 0 ? (
                <Card className="max-w-lg mx-auto glass-strong border-purple-500/30">
                  <CardHeader className="text-center">
                    <div className="w-16 h-16 rounded-full bg-gradient-primary/20 flex items-center justify-center mx-auto mb-4">
                      <Video className="w-8 h-8 text-purple-400" />
                    </div>
                    <CardTitle className="text-white">No Videos Yet</CardTitle>
                    <CardDescription className="text-white/60">
                      You haven't created any videos yet. Start a chat with an avatar and ask them to create a video about a topic!
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex justify-center">
                    <Button onClick={() => setLocation('/')} data-testid="button-start-chat-empty">
                      <Sparkles className="w-4 h-4 mr-2" />
                      Start Chatting
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-8">
                  {/* Pending/Generating Videos */}
                  {pendingVideos.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-cyan-500/20 flex items-center justify-center">
                          <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
                        </div>
                        In Progress ({pendingVideos.length})
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {pendingVideos.map((video) => (
                          <Card key={video.id} className="overflow-hidden glass-strong border-cyan-500/20 group" data-testid={`card-video-${video.id}`}>
                            <div className="aspect-video bg-gradient-to-br from-cyan-500/10 to-purple-500/10 flex items-center justify-center relative">
                              <div className="absolute inset-0 flex items-center justify-center">
                                <div className="w-16 h-16 rounded-full bg-gradient-primary/30 flex items-center justify-center animate-pulse">
                                  <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
                                </div>
                              </div>
                              <div className="absolute bottom-2 right-2 glass px-2 py-1 rounded text-xs text-cyan-400 flex items-center gap-1">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                Generating...
                              </div>
                            </div>
                            <CardContent className="p-4">
                              <h4 className="font-medium text-white truncate mb-2">{video.topic}</h4>
                              <div className="flex items-center gap-2 text-sm text-white/60">
                                {getStatusIcon(video.status)}
                                <span>{getStatusText(video.status)}</span>
                              </div>
                              <p className="text-xs text-white/40 mt-2">
                                Started {formatDistanceToNow(new Date(video.createdAt), { addSuffix: true })}
                              </p>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Completed Videos */}
                  {completedVideos.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center">
                          <CheckCircle className="w-4 h-4 text-green-400" />
                        </div>
                        Completed ({completedVideos.length})
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {completedVideos.map((video) => (
                          <Card key={video.id} className="overflow-hidden glass-strong border-green-500/20 hover:border-green-500/40 transition-all duration-300 group card-hover" data-testid={`card-video-${video.id}`}>
                            {video.videoUrl ? (
                              <div className="relative aspect-video">
                                <video
                                  src={video.videoUrl}
                                  className="aspect-video w-full object-cover"
                                  controls
                                  preload="metadata"
                                />
                                <div className="absolute top-2 right-2 glass px-2 py-1 rounded text-xs text-green-400 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Play className="w-3 h-3" />
                                  Ready
                                </div>
                              </div>
                            ) : (
                              <div className="aspect-video bg-gradient-to-br from-green-500/10 to-emerald-500/10 flex items-center justify-center">
                                <Video className="w-12 h-12 text-green-400/50" />
                              </div>
                            )}
                            <CardContent className="p-4">
                              <h4 className="font-medium text-white truncate mb-2">{video.topic}</h4>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-sm text-green-400">
                                  {getStatusIcon(video.status)}
                                  <span>{getStatusText(video.status)}</span>
                                </div>
                                {video.videoUrl && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-white/70 hover:text-white"
                                    asChild
                                    data-testid={`button-download-${video.id}`}
                                  >
                                    <a href={video.videoUrl} download target="_blank" rel="noopener noreferrer">
                                      <Download className="w-4 h-4" />
                                    </a>
                                  </Button>
                                )}
                              </div>
                              <p className="text-xs text-white/40 mt-2">
                                Completed {video.completedAt 
                                  ? formatDistanceToNow(new Date(video.completedAt), { addSuffix: true })
                                  : formatDistanceToNow(new Date(video.createdAt), { addSuffix: true })}
                              </p>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Failed Videos */}
                  {failedVideos.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-red-500/20 flex items-center justify-center">
                          <AlertCircle className="w-4 h-4 text-red-400" />
                        </div>
                        Failed ({failedVideos.length})
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {failedVideos.map((video) => (
                          <Card key={video.id} className="overflow-hidden glass-strong border-red-500/20" data-testid={`card-video-${video.id}`}>
                            <div className="aspect-video bg-gradient-to-br from-red-500/10 to-rose-500/10 flex items-center justify-center">
                              <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center">
                                <AlertCircle className="w-8 h-8 text-red-400" />
                              </div>
                            </div>
                            <CardContent className="p-4">
                              <h4 className="font-medium text-white truncate mb-2">{video.topic}</h4>
                              <div className="flex items-center gap-2 text-sm text-red-400">
                                {getStatusIcon(video.status)}
                                <span>{getStatusText(video.status)}</span>
                              </div>
                              <p className="text-xs text-white/40 mt-2">
                                {formatDistanceToNow(new Date(video.createdAt), { addSuffix: true })}
                              </p>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Courses View */}
          {currentView === 'courses' && (
            <>
              {coursesLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <div className="w-12 h-12 rounded-full bg-gradient-primary glow-primary flex items-center justify-center mx-auto mb-4 animate-pulse">
                      <Loader2 className="w-6 h-6 text-white animate-spin" />
                    </div>
                    <p className="text-white/60">Loading courses...</p>
                  </div>
                </div>
              ) : !courses || courses.length === 0 ? (
                <Card className="max-w-lg mx-auto glass-strong border-purple-500/30">
                  <CardHeader className="text-center">
                    <div className="w-16 h-16 rounded-full bg-gradient-primary/20 flex items-center justify-center mx-auto mb-4">
                      <BookOpen className="w-8 h-8 text-purple-400" />
                    </div>
                    <CardTitle className="text-white">No Courses Yet</CardTitle>
                    <CardDescription className="text-white/60">
                      Start creating video courses with AI avatars. Build structured lessons and generate professional videos.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex justify-center">
                    <Button onClick={() => { setSelectedCourseId(null); setCurrentView('course-edit'); }} data-testid="button-create-course">
                      <Plus className="w-4 h-4 mr-2" />
                      Create Your First Course
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <>
                  <div className="flex justify-end mb-6">
                    <Button onClick={() => { setSelectedCourseId(null); setCurrentView('course-edit'); }} data-testid="button-new-course">
                      <Plus className="w-4 h-4 mr-2" />
                      New Course
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                    {courses.map((course) => (
                      <Card
                        key={course.id}
                        className="glass-strong border-white/10 hover:border-purple-500/30 transition-all duration-300 cursor-pointer group card-hover overflow-hidden flex flex-col"
                        onClick={() => { setSelectedCourseId(course.id); setCurrentView('course-view'); }}
                        data-testid={`card-course-${course.id}`}
                      >
                        {/* Thumbnail - use first lesson's video thumbnail or course thumbnail */}
                        <div className="relative aspect-video bg-gradient-to-br from-purple-500/20 to-cyan-500/20 overflow-hidden">
                          {(() => {
                            // Get thumbnail from first completed lesson's video, or fallback to course thumbnail
                            const firstVideoThumbnail = course.lessons?.find(l => l.video?.thumbnailUrl)?.video?.thumbnailUrl;
                            const thumbnailUrl = course.thumbnailUrl || firstVideoThumbnail;
                            
                            return thumbnailUrl ? (
                              <img 
                                src={thumbnailUrl} 
                                alt={course.title}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <div className="w-16 h-16 rounded-full bg-gradient-primary/30 flex items-center justify-center">
                                  <BookOpen className="w-8 h-8 text-purple-400" />
                                </div>
                              </div>
                            );
                          })()}
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <Play className="w-12 h-12 text-white" />
                          </div>
                          {course.totalLessons > 0 && (
                            <div className="absolute bottom-2 right-2 glass px-2 py-1 rounded text-xs text-white flex items-center gap-1">
                              <Video className="w-3 h-3" />
                              {course.totalLessons} lessons
                            </div>
                          )}
                          <div className="absolute top-2 right-2">
                            <Badge className={`text-xs ${
                              course.status === 'completed' ? 'bg-green-500/80 text-white' :
                              course.status === 'generating' ? 'bg-yellow-500/80 text-white' :
                              'bg-gray-500/80 text-white'
                            }`}>
                              {course.status}
                            </Badge>
                          </div>
                        </div>
                        <CardHeader className="p-4 md:p-5 pb-2">
                          <CardTitle className="text-white text-lg line-clamp-2">
                            {course.title}
                          </CardTitle>
                          <CardDescription className="text-white/60 line-clamp-2 mt-1">
                            {course.description || "No description"}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="p-4 md:p-5 pt-0 flex-1 flex flex-col">
                          <div className="flex items-center justify-between text-sm text-white/60 mb-3">
                            <div className="flex items-center gap-2">
                              <User className="w-4 h-4" />
                              <span>{avatars?.find(a => a.id === course.avatarId)?.name || course.avatarId}</span>
                            </div>
                            {course.totalDuration > 0 && (
                              <div className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                <span>{Math.floor(course.totalDuration / 60)}:{(course.totalDuration % 60).toString().padStart(2, '0')}</span>
                              </div>
                            )}
                          </div>
                          <div className="mt-auto pt-3 border-t border-white/10">
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full border-purple-500/30 text-purple-300 hover:bg-purple-500/20 hover:text-white"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedCourseId(course.id);
                                setCurrentView('course-edit');
                              }}
                              data-testid={`button-edit-course-${course.id}`}
                            >
                              <Settings className="w-4 h-4 mr-2" />
                              Edit Course
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {/* Credits View */}
          {currentView === 'credits' && (
            <>
              {creditsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <div className="w-12 h-12 rounded-full bg-gradient-primary glow-primary flex items-center justify-center mx-auto mb-4 animate-pulse">
                      <Loader2 className="w-6 h-6 text-white animate-spin" />
                    </div>
                    <p className="text-white/60">Loading credits...</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Credit Cards */}
                  <div className="grid gap-4 sm:gap-6 grid-cols-1 md:grid-cols-3">
                    {/* HeyGen Credits */}
                    <Card className="glass-strong border-purple-500/20 hover:border-purple-500/40 transition-all duration-300 group">
                      <CardHeader className="p-4 sm:p-6 pb-3">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base font-semibold flex items-center gap-2 text-white">
                            <div className="w-8 h-8 rounded-lg bg-gradient-primary flex items-center justify-center">
                              <DollarSign className="w-4 h-4 text-white" />
                            </div>
                            HeyGen
                          </CardTitle>
                          {heygenStats && (
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              heygenStats.status === 'ok' ? 'bg-green-500/20 text-green-300' :
                              heygenStats.status === 'warning' ? 'bg-yellow-500/20 text-yellow-300' :
                              'bg-red-500/20 text-red-300'
                            }`}>
                              {heygenStats.status === 'ok' ? 'Healthy' : heygenStats.status === 'warning' ? 'Warning' : 'Critical'}
                            </span>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent className="p-4 sm:p-6 pt-0 space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-xs text-white/60 mb-1">Used</p>
                            <p className="text-xl font-semibold text-white">{heygenStats?.totalUsed?.toLocaleString() || 0}</p>
                          </div>
                          <div>
                            <p className="text-xs text-white/60 mb-1">Remaining</p>
                            <p className="text-xl font-semibold text-cyan-400">{heygenStats?.remaining?.toLocaleString() || 0}</p>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between text-xs text-white/60">
                            <span>Usage</span>
                            <span className="font-medium">{heygenStats ? ((heygenStats.totalUsed / heygenStats.limit) * 100).toFixed(1) : 0}%</span>
                          </div>
                          <div className="w-full bg-white/10 rounded-full h-2">
                            <div 
                              className="h-2 rounded-full bg-gradient-to-r from-purple-500 to-cyan-500 transition-all"
                              style={{ width: `${heygenStats ? Math.min((heygenStats.totalUsed / heygenStats.limit) * 100, 100) : 0}%` }}
                            />
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Claude Credits (placeholder) */}
                    <Card className="glass-strong border-cyan-500/20 hover:border-cyan-500/40 transition-all duration-300 group">
                      <CardHeader className="p-4 sm:p-6 pb-3">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base font-semibold flex items-center gap-2 text-white">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 flex items-center justify-center">
                              <Activity className="w-4 h-4 text-white" />
                            </div>
                            Claude AI
                          </CardTitle>
                          <span className="px-2 py-1 rounded text-xs font-medium bg-green-500/20 text-green-300">
                            Healthy
                          </span>
                        </div>
                      </CardHeader>
                      <CardContent className="p-4 sm:p-6 pt-0 space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-xs text-white/60 mb-1">Used</p>
                            <p className="text-xl font-semibold text-white">450,000</p>
                          </div>
                          <div>
                            <p className="text-xs text-white/60 mb-1">Remaining</p>
                            <p className="text-xl font-semibold text-cyan-400">550,000</p>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between text-xs text-white/60">
                            <span>Usage</span>
                            <span className="font-medium">45.0%</span>
                          </div>
                          <div className="w-full bg-white/10 rounded-full h-2">
                            <div 
                              className="h-2 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all"
                              style={{ width: '45%' }}
                            />
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* ElevenLabs Credits (placeholder) */}
                    <Card className="glass-strong border-green-500/20 hover:border-green-500/40 transition-all duration-300 group">
                      <CardHeader className="p-4 sm:p-6 pb-3">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base font-semibold flex items-center gap-2 text-white">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-r from-green-500 to-emerald-500 flex items-center justify-center">
                              <TrendingUp className="w-4 h-4 text-white" />
                            </div>
                            ElevenLabs
                          </CardTitle>
                          <span className="px-2 py-1 rounded text-xs font-medium bg-green-500/20 text-green-300">
                            Healthy
                          </span>
                        </div>
                      </CardHeader>
                      <CardContent className="p-4 sm:p-6 pt-0 space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-xs text-white/60 mb-1">Used</p>
                            <p className="text-xl font-semibold text-white">120,000</p>
                          </div>
                          <div>
                            <p className="text-xs text-white/60 mb-1">Remaining</p>
                            <p className="text-xl font-semibold text-cyan-400">380,000</p>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between text-xs text-white/60">
                            <span>Usage</span>
                            <span className="font-medium">24.0%</span>
                          </div>
                          <div className="w-full bg-white/10 rounded-full h-2">
                            <div 
                              className="h-2 rounded-full bg-gradient-to-r from-green-500 to-emerald-500 transition-all"
                              style={{ width: '24%' }}
                            />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Usage Chart */}
                  <Card className="glass-strong border-white/10">
                    <CardHeader className="p-4 sm:p-6 pb-3">
                      <CardTitle className="text-base font-semibold text-white">Service Comparison</CardTitle>
                      <CardDescription className="text-white/60">Compare credit usage across all services</CardDescription>
                    </CardHeader>
                    <CardContent className="p-4 sm:p-6 pt-0">
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart 
                          data={[
                            { name: 'HeyGen', used: heygenStats?.totalUsed || 0, remaining: heygenStats?.remaining || 0 },
                            { name: 'Claude', used: 450000, remaining: 550000 },
                            { name: 'ElevenLabs', used: 120000, remaining: 380000 },
                          ]} 
                          margin={{ left: 20, right: 20, top: 5, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                          <XAxis dataKey="name" stroke="rgba(255,255,255,0.5)" tick={{ fontSize: 12 }} />
                          <YAxis 
                            stroke="rgba(255,255,255,0.5)" 
                            width={60}
                            tick={{ fontSize: 12 }}
                            tickFormatter={(value) => {
                              if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
                              if (value >= 1000) return `${(value / 1000).toFixed(0)}k`;
                              return value.toString();
                            }}
                          />
                          <Tooltip 
                            contentStyle={{ 
                              backgroundColor: 'rgba(0,0,0,0.8)', 
                              border: '1px solid rgba(255,255,255,0.2)',
                              borderRadius: '8px',
                              color: 'white'
                            }}
                            formatter={(value: number) => value.toLocaleString()}
                          />
                          <Legend />
                          <Bar dataKey="used" fill="#64748b" name="Used Credits" />
                          <Bar dataKey="remaining" fill="#06b6d4" name="Remaining Credits" />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  {/* Alert if credits low */}
                  {heygenStats && heygenStats.status !== 'ok' && (
                    <Card className="glass-strong border-yellow-500/30 bg-yellow-500/5">
                      <CardHeader className="p-4 sm:p-6 pb-3">
                        <CardTitle className="text-base font-semibold flex items-center gap-2 text-yellow-300">
                          <AlertCircle className="w-4 h-4" />
                          Credit Alert
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-4 sm:p-6 pt-0">
                        <p className="text-sm text-yellow-200/80">
                          HeyGen credits are running low. Current status: <strong className="font-semibold">{heygenStats.status}</strong>. 
                          Only {heygenStats.remaining.toLocaleString()} credits remaining out of {heygenStats.limit.toLocaleString()}.
                        </p>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}
            </>
          )}

          {/* Course View - Show Course Videos */}
          {currentView === 'course-view' && selectedCourseId && (() => {
            const selectedCourse = courses?.find(c => c.id === selectedCourseId);
            if (!selectedCourse) {
              return (
                <div className="text-center py-12">
                  <p className="text-white/60">Course not found</p>
                  <Button onClick={() => setCurrentView('courses')} className="mt-4">
                    Back to Courses
                  </Button>
                </div>
              );
            }
            
            const lessonsWithVideos = selectedCourse.lessons?.filter(l => l.video?.videoUrl) || [];
            const pendingLessons = selectedCourse.lessons?.filter(l => !l.video?.videoUrl) || [];
            
            return (
              <div className="space-y-6">
                {/* Back button and course header */}
                <div className="flex items-center justify-between">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setSelectedCourseId(null);
                      setCurrentView('courses');
                    }}
                    className="text-white/60 hover:text-white"
                    data-testid="button-back-to-courses"
                  >
                    <ChevronLeft className="w-4 h-4 mr-1" />
                    Back to Courses
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-purple-500/30 text-purple-300 hover:bg-purple-500/20"
                    onClick={() => setCurrentView('course-edit')}
                    data-testid="button-edit-course-from-view"
                  >
                    <Settings className="w-4 h-4 mr-2" />
                    Edit Course
                  </Button>
                </div>
                
                {/* Course Info */}
                <Card className="glass-strong border-purple-500/20">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-white text-xl">{selectedCourse.title}</CardTitle>
                        <CardDescription className="text-white/60 mt-1">
                          {selectedCourse.description || "No description"}
                        </CardDescription>
                      </div>
                      <Badge className={`${
                        selectedCourse.status === 'completed' ? 'bg-green-500/20 text-green-300' :
                        selectedCourse.status === 'generating' ? 'bg-yellow-500/20 text-yellow-300' :
                        'bg-gray-500/20 text-gray-300'
                      }`}>
                        {selectedCourse.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 mt-3 text-sm text-white/60">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4" />
                        <span>{avatars?.find(a => a.id === selectedCourse.avatarId)?.name || selectedCourse.avatarId}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Video className="w-4 h-4" />
                        <span>{selectedCourse.totalLessons || 0} lessons</span>
                      </div>
                      {selectedCourse.totalDuration > 0 && (
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4" />
                          <span>{Math.floor(selectedCourse.totalDuration / 60)}:{(selectedCourse.totalDuration % 60).toString().padStart(2, '0')}</span>
                        </div>
                      )}
                    </div>
                  </CardHeader>
                </Card>
                
                {/* Videos Grid */}
                {lessonsWithVideos.length === 0 && pendingLessons.length === 0 ? (
                  <Card className="glass-strong border-white/10">
                    <CardContent className="py-12 text-center">
                      <div className="w-16 h-16 rounded-full bg-gradient-primary/20 flex items-center justify-center mx-auto mb-4">
                        <Video className="w-8 h-8 text-purple-400" />
                      </div>
                      <p className="text-white/60">No lessons in this course yet</p>
                      <Button
                        onClick={() => setCurrentView('course-edit')}
                        className="mt-4"
                        data-testid="button-add-lessons"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Add Lessons
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                      <Video className="w-5 h-5 text-purple-400" />
                      Course Videos ({lessonsWithVideos.length})
                    </h3>
                    
                    {lessonsWithVideos.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {lessonsWithVideos.map((lesson, index) => (
                          <Card key={lesson.id} className="glass-strong border-white/10 overflow-hidden group" data-testid={`card-lesson-video-${lesson.id}`}>
                            <div className="relative aspect-video bg-gradient-to-br from-purple-500/20 to-cyan-500/20">
                              {lesson.video?.thumbnailUrl ? (
                                <img 
                                  src={lesson.video.thumbnailUrl} 
                                  alt={lesson.title}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <Video className="w-12 h-12 text-purple-400/50" />
                                </div>
                              )}
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <a 
                                  href={lesson.video?.videoUrl || '#'} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="w-14 h-14 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/30 transition-colors"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Play className="w-7 h-7 text-white ml-1" />
                                </a>
                              </div>
                              <div className="absolute top-2 left-2 glass px-2 py-1 rounded text-xs text-white">
                                Lesson {index + 1}
                              </div>
                              {lesson.video?.duration && (
                                <div className="absolute bottom-2 right-2 glass px-2 py-1 rounded text-xs text-white">
                                  {Math.floor(lesson.video.duration / 60)}:{(lesson.video.duration % 60).toString().padStart(2, '0')}
                                </div>
                              )}
                            </div>
                            <CardContent className="p-4">
                              <h4 className="font-medium text-white truncate">{lesson.title}</h4>
                              <div className="flex items-center justify-between mt-2">
                                <Badge className="bg-green-500/20 text-green-300 text-xs">
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                  Ready
                                </Badge>
                                <a
                                  href={lesson.video?.videoUrl || '#'}
                                  download
                                  className="text-purple-400 hover:text-purple-300 transition-colors"
                                  onClick={(e) => e.stopPropagation()}
                                  data-testid={`button-download-video-${lesson.id}`}
                                >
                                  <Download className="w-4 h-4" />
                                </a>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    ) : (
                      <Card className="glass-strong border-white/10">
                        <CardContent className="py-8 text-center">
                          <p className="text-white/60">No videos generated yet</p>
                          <p className="text-white/40 text-sm mt-1">Go to Edit Course to generate videos</p>
                        </CardContent>
                      </Card>
                    )}
                    
                    {/* Pending Lessons */}
                    {pendingLessons.length > 0 && (
                      <div className="mt-6">
                        <h3 className="text-lg font-semibold text-white/60 flex items-center gap-2 mb-4">
                          <Clock className="w-5 h-5 text-yellow-400" />
                          Pending Videos ({pendingLessons.length})
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {pendingLessons.map((lesson, index) => (
                            <Card key={lesson.id} className="glass border-white/10 opacity-60" data-testid={`card-lesson-pending-${lesson.id}`}>
                              <div className="aspect-video bg-gradient-to-br from-gray-500/20 to-slate-500/20 flex items-center justify-center">
                                <div className="text-center">
                                  <Loader2 className="w-8 h-8 text-white/40 mx-auto mb-2 animate-spin" />
                                  <p className="text-xs text-white/40">Not generated</p>
                                </div>
                              </div>
                              <CardContent className="p-4">
                                <h4 className="font-medium text-white/60 truncate">{lesson.title}</h4>
                                <Badge className="mt-2 bg-gray-500/20 text-gray-300 text-xs">
                                  Pending
                                </Badge>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Course Edit View - Embedded Course Builder */}
          {currentView === 'course-edit' && (
            <div className="glass-strong border-white/10 rounded-lg overflow-hidden">
              <CourseBuilderPage 
                isEmbedded={true}
                courseId={selectedCourseId}
                onBack={() => {
                  setSelectedCourseId(null);
                  setCurrentView('courses');
                }}
              />
            </div>
          )}

          {/* Mood Tracker View */}
          {currentView === 'mood' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Log Your Mood */}
              <Card className="glass-strong border-purple-500/20">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <Heart className="w-5 h-5 text-pink-400" />
                    How are you feeling?
                  </CardTitle>
                  <CardDescription className="text-white/60">
                    Select your current emotional state
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Mood Selection Cards */}
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                    {[
                      { mood: 'joyful' as MoodType, emoji: '😊', label: 'Joyful', color: 'from-yellow-500/20 to-orange-500/20 border-yellow-500/30' },
                      { mood: 'calm' as MoodType, emoji: '😌', label: 'Calm', color: 'from-blue-500/20 to-cyan-500/20 border-blue-500/30' },
                      { mood: 'energized' as MoodType, emoji: '⚡', label: 'Energized', color: 'from-purple-500/20 to-pink-500/20 border-purple-500/30' },
                      { mood: 'neutral' as MoodType, emoji: '😐', label: 'Neutral', color: 'from-gray-500/20 to-slate-500/20 border-gray-500/30' },
                      { mood: 'anxious' as MoodType, emoji: '😰', label: 'Anxious', color: 'from-amber-500/20 to-red-500/20 border-amber-500/30' },
                      { mood: 'sad' as MoodType, emoji: '😢', label: 'Sad', color: 'from-indigo-500/20 to-blue-500/20 border-indigo-500/30' },
                      { mood: 'stressed' as MoodType, emoji: '😫', label: 'Stressed', color: 'from-red-500/20 to-orange-500/20 border-red-500/30' },
                    ].map(({ mood, emoji, label, color }) => (
                      <button
                        key={mood}
                        onClick={() => setSelectedMood(mood)}
                        className={`p-4 rounded-xl border transition-all duration-200 bg-gradient-to-br ${color} ${
                          selectedMood === mood 
                            ? 'ring-2 ring-purple-400 scale-105' 
                            : 'hover:scale-102 hover:brightness-110'
                        }`}
                        data-testid={`button-mood-${mood}`}
                      >
                        <div className="text-3xl mb-1">{emoji}</div>
                        <div className="text-xs text-white/80 font-medium">{label}</div>
                      </button>
                    ))}
                  </div>

                  {/* Intensity Slider */}
                  {selectedMood && (
                    <div className="space-y-3 animate-in fade-in duration-300">
                      <label className="text-sm font-medium text-white/80">
                        Intensity: <span className="text-purple-400">{moodIntensity}/5</span>
                      </label>
                      <Slider
                        value={[moodIntensity]}
                        onValueChange={(value) => setMoodIntensity(value[0])}
                        min={1}
                        max={5}
                        step={1}
                        className="w-full"
                        data-testid="slider-mood-intensity"
                      />
                      <div className="flex justify-between text-xs text-white/50">
                        <span>Mild</span>
                        <span>Moderate</span>
                        <span>Intense</span>
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  {selectedMood && (
                    <div className="space-y-2 animate-in fade-in duration-300">
                      <label className="text-sm font-medium text-white/80">
                        Add a note (optional)
                      </label>
                      <Textarea
                        placeholder="What's on your mind?"
                        value={moodNotes}
                        onChange={(e) => setMoodNotes(e.target.value)}
                        className="glass border-white/20 text-white placeholder:text-white/40 resize-none"
                        rows={3}
                        maxLength={500}
                        data-testid="textarea-mood-notes"
                      />
                      <p className="text-xs text-white/40 text-right">{moodNotes.length}/500</p>
                    </div>
                  )}

                  {/* Submit Button */}
                  {selectedMood && (
                    <Button
                      onClick={() => moodMutation.mutate({ mood: selectedMood, intensity: moodIntensity, notes: moodNotes || undefined })}
                      disabled={moodMutation.isPending}
                      className="w-full bg-gradient-primary hover:opacity-90 transition-opacity"
                      data-testid="button-log-mood"
                    >
                      {moodMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Logging your mood...
                        </>
                      ) : (
                        <>
                          <Heart className="w-4 h-4 mr-2" />
                          Log My Mood
                        </>
                      )}
                    </Button>
                  )}

                  {/* Avatar Response */}
                  {lastMoodResponse && (
                    <div className="mt-4 p-4 rounded-xl glass border border-purple-500/30 animate-in fade-in slide-in-from-bottom-2 duration-500">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center shrink-0">
                          <Sparkles className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-purple-300 mb-1">Your wellness guide says:</p>
                          <p className="text-white/90 text-sm leading-relaxed">{lastMoodResponse.response}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Mood History */}
              <Card className="glass-strong border-purple-500/20">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <Activity className="w-5 h-5 text-cyan-400" />
                    Your Mood History
                  </CardTitle>
                  <CardDescription className="text-white/60">
                    Recent emotional wellness logs
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {moodLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
                    </div>
                  ) : !moodEntries || moodEntries.length === 0 ? (
                    <div className="text-center py-8">
                      <div className="w-16 h-16 rounded-full bg-gradient-primary/20 flex items-center justify-center mx-auto mb-4">
                        <Heart className="w-8 h-8 text-purple-400" />
                      </div>
                      <p className="text-white/60 text-sm">No mood entries yet</p>
                      <p className="text-white/40 text-xs mt-1">Log your first mood to start tracking</p>
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                      {moodEntries.slice(0, 10).map((entry) => {
                        const moodEmojis: Record<string, string> = {
                          joyful: '😊', calm: '😌', energized: '⚡', neutral: '😐',
                          anxious: '😰', sad: '😢', stressed: '😫'
                        };
                        return (
                          <div
                            key={entry.id}
                            className="p-3 rounded-lg glass border border-white/10 hover:border-purple-500/30 transition-colors"
                            data-testid={`mood-entry-${entry.id}`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span className="text-2xl">{moodEmojis[entry.mood] || '😐'}</span>
                                <div>
                                  <span className="text-sm font-medium text-white capitalize">{entry.mood}</span>
                                  <span className="text-xs text-white/40 ml-2">
                                    Intensity: {entry.intensity}/5
                                  </span>
                                </div>
                              </div>
                              <span className="text-xs text-white/40">
                                {formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })}
                              </span>
                            </div>
                            {entry.notes && (
                              <p className="text-xs text-white/60 mb-2 line-clamp-2">{entry.notes}</p>
                            )}
                            {entry.avatarResponse && (
                              <div className="text-xs text-purple-300/80 italic line-clamp-2 border-t border-white/10 pt-2 mt-2">
                                "{entry.avatarResponse}"
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Settings View */}
          {currentView === 'settings' && (
            <div className="max-w-2xl mx-auto">
              <Card className="glass-strong border-purple-500/20">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <Settings className="w-5 h-5 text-purple-400" />
                    Account Settings
                  </CardTitle>
                  <CardDescription className="text-white/60">
                    Manage your account preferences
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="glass p-4 rounded-lg border border-white/10">
                    <h4 className="text-sm font-medium text-white mb-2">Profile Information</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-white/60">Email</span>
                        <span className="text-white">{user?.email || 'Not available'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white/60">Name</span>
                        <span className="text-white">{user?.firstName || user?.lastName ? `${user?.firstName || ''} ${user?.lastName || ''}`.trim() : 'Not set'}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="glass p-4 rounded-lg border border-white/10">
                    <h4 className="text-sm font-medium text-white mb-2">Account Actions</h4>
                    <Button variant="destructive" size="sm" asChild className="w-full sm:w-auto">
                      <a href="/api/logout">
                        <LogOut className="w-4 h-4 mr-2" />
                        Sign Out
                      </a>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
