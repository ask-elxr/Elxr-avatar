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
  Database
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { formatDistanceToNow } from "date-fns";

type UserView = 'dashboard' | 'chat' | 'videos' | 'settings';

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

export default function Dashboard() {
  const { isAuthenticated, isLoading, user, isAdmin } = useAuth();
  const [currentView, setCurrentView] = useState<UserView>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [, setLocation] = useLocation();

  const { data: chatVideos, isLoading: videosLoading } = useQuery<ChatVideo[]>({
    queryKey: ['/api/courses/chat-videos'],
    enabled: isAuthenticated,
  });

  const completedVideos = chatVideos?.filter((v) => v.status === 'completed') || [];
  const pendingVideos = chatVideos?.filter((v) => v.status === 'pending' || v.status === 'generating') || [];
  const failedVideos = chatVideos?.filter((v) => v.status === 'failed') || [];

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

  const NavButton = ({ view, icon: Icon, label, onClick }: { view: UserView; icon: any; label: string; onClick?: () => void }) => (
    <Button
      variant={currentView === view ? 'default' : 'ghost'}
      className={`w-full justify-start transition-all duration-300 ${sidebarOpen ? '' : 'justify-center px-2'}`}
      onClick={() => {
        if (onClick) {
          onClick();
        } else {
          setCurrentView(view);
        }
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
          <NavButton view="chat" icon={MessageSquare} label="Avatar Chat" onClick={() => setLocation('/')} />
          <NavButton view="videos" icon={Video} label="My Videos" />
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
              {currentView === 'videos' && 'Videos generated from your chat conversations'}
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
