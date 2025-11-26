import { DocumentUpload } from "@/components/DocumentUpload";
import { AvatarManager } from "@/components/AvatarManager";
import { DatabaseStatus } from "@/components/DatabaseStatus";
import CourseBuilderPage from "@/pages/course-builder";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, Users, FileText, Settings, Home, LogOut, Video, Plus, Play, CreditCard, BarChart3, Menu, ChevronLeft } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { Link, useLocation, useSearch } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import Credits from "@/pages/Credits";
import Analytics from "@/pages/Analytics";

type AdminView = 'dashboard' | 'avatars' | 'knowledge' | 'courses' | 'analytics' | 'credits' | 'settings';

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

export default function Admin() {
  const [currentView, setCurrentView] = useState<AdminView>('dashboard');
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [showCourseBuilder, setShowCourseBuilder] = useState(false);
  const [preSelectedAvatarId, setPreSelectedAvatarId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { toast } = useToast();
  const { user, isLoading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const searchString = useSearch();

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

  // Auto-collapse sidebar on mobile
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

  const { data: avatarsData } = useQuery({
    queryKey: ['/api/admin/avatars'],
    enabled: isAuthenticated,
  });

  const { data: statsData } = useQuery({
    queryKey: ['/api/pinecone/stats'],
    enabled: isAuthenticated,
  });

  const { data: coursesData } = useQuery({
    queryKey: ['/api/courses'],
    enabled: isAuthenticated,
  });

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({
        title: "Please sign in",
        description: "You need to be signed in to access the admin panel.",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 1000);
    }
  }, [isAuthenticated, isLoading, toast]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" data-testid="loading-spinner"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen" data-testid="signin-prompt">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Admin Access Required</CardTitle>
            <CardDescription>
              Please sign in to access the admin dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button asChild data-testid="button-signin">
              <a href="/api/login">Sign In</a>
            </Button>
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
    <div className="flex min-h-screen bg-background overflow-hidden">
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
          fixed md:sticky top-0 z-50 h-screen
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
          <NavButton view="analytics" icon={BarChart3} label="Analytics" />
          <NavButton view="credits" icon={CreditCard} label="Credits" />
          <NavButton view="settings" icon={Settings} label="Settings" />
        </nav>

        <div className="p-2 border-t space-y-1">
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
            className={`w-full justify-start text-destructive hover:text-destructive transition-all duration-300 ${sidebarOpen ? '' : 'justify-center px-2'}`}
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
      <main className="flex-1 min-w-0 overflow-auto transition-all duration-300">
        {/* Mobile Header with Menu Button */}
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
                <Card>
                  <CardHeader className="p-4 sm:p-6">
                    <CardTitle className="text-base sm:text-lg">Avatars</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 sm:p-6 pt-0">
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
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
                <Card>
                  <CardHeader className="p-4 sm:p-6">
                    <CardTitle className="text-base sm:text-lg">Resources</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 sm:p-6 pt-0">
                    <div className="space-y-2">
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
                <Card>
                  <CardHeader className="p-4 sm:p-6">
                    <CardTitle className="text-base sm:text-lg">Status</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 sm:p-6 pt-0">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-green-500"></div>
                        <span className="text-xs sm:text-sm">All Systems Operational</span>
                      </div>
                      <Button 
                        variant="outline" 
                        className="w-full mt-4"
                        onClick={() => setCurrentView('settings')}
                      >
                        Settings
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>

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
                        <div className="flex items-center gap-3 justify-between sm:justify-end">
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
              <Card>
                <CardHeader className="p-4 sm:p-6">
                  <CardTitle>Upload Documents</CardTitle>
                  <CardDescription>
                    Upload documents to enhance AI avatar responses and capabilities
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4 sm:p-6 pt-0">
                  <DocumentUpload />
                </CardContent>
              </Card>
            </div>
          )}

          {/* Courses View */}
          {currentView === 'courses' && !showCourseBuilder && (
            <div className="space-y-4 sm:space-y-6">
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
