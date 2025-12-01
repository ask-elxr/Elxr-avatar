import { DocumentUpload } from "@/components/DocumentUpload";
import { AvatarManager } from "@/components/AvatarManager";
import { DatabaseStatus } from "@/components/DatabaseStatus";
import CourseBuilderPage from "@/pages/course-builder";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LayoutDashboard, Users, FileText, Video, Plus, Play, CreditCard, BarChart3, UserCog, Crown, Clock, Activity, Loader2, AlertCircle, Check, Trash2, ChevronUp, ChevronDown, Lock } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { Link, useSearch } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, hasAdminAccess, getAdminSecret } from "@/lib/queryClient";
import Credits from "@/pages/Credits";
import Analytics from "@/pages/Analytics";

type AdminView = 'dashboard' | 'avatars' | 'knowledge' | 'courses' | 'users' | 'analytics' | 'credits' | 'settings';

interface EmbedAdminProps {
  view: AdminView;
}

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

export default function EmbedAdmin({ view }: EmbedAdminProps) {
  const [adminSecretInput, setAdminSecretInput] = useState('');
  const [isAdminVerified, setIsAdminVerified] = useState(false);
  const [showCourseBuilder, setShowCourseBuilder] = useState(false);
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [preSelectedAvatarId, setPreSelectedAvatarId] = useState<string | null>(null);
  const { toast } = useToast();
  const searchString = useSearch();
  
  useEffect(() => {
    const urlParams = new URLSearchParams(searchString);
    const urlSecret = urlParams.get('admin_secret');
    if (urlSecret) {
      localStorage.setItem('admin_secret', urlSecret);
      setIsAdminVerified(true);
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    } else if (hasAdminAccess()) {
      setIsAdminVerified(true);
    }
  }, [searchString]);

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

  const handleAdminSecretSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminSecretInput.trim()) return;
    
    localStorage.setItem('admin_secret', adminSecretInput);
    
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

  if (!isAdminVerified) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-b from-black via-gray-900 to-black" data-testid="admin-login">
        <Card className="w-full max-w-md mx-4 glass border-white/10">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <Lock className="w-6 h-6 text-primary" />
            </div>
            <CardTitle className="text-white">Admin Access Required</CardTitle>
            <CardDescription>
              Enter the admin secret to access this page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAdminSecretSubmit} className="space-y-4">
              <Input
                type="password"
                placeholder="Admin Secret"
                value={adminSecretInput}
                onChange={(e) => setAdminSecretInput(e.target.value)}
                className="bg-white/5 border-white/10"
                data-testid="input-admin-secret"
                autoFocus
              />
              <Button 
                type="submit" 
                className="w-full" 
                disabled={!adminSecretInput.trim()}
                data-testid="button-submit-admin-secret"
              >
                Access Admin
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalAvatars = Array.isArray(avatarsData) ? avatarsData.filter((a: any) => a.isActive).length : 0;
  const totalDocuments = (statsData as any)?.success ? ((statsData as any).documents?.total || 0) : 0;
  const totalVectors = (statsData as any)?.success ? ((statsData as any).pinecone?.totalRecordCount || 0) : 0;

  const renderContent = () => {
    switch (view) {
      case 'avatars':
        return (
          <div className="p-4 sm:p-6 space-y-6">
            <h2 className="text-xl sm:text-2xl font-bold text-white mb-4">Avatar Management</h2>
            <AvatarManager />
            
            <Card className="glass border-white/10 mt-6">
              <CardHeader>
                <CardTitle className="text-white">Active Avatars Order</CardTitle>
                <CardDescription>Drag to reorder how avatars appear to users</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {Array.isArray(avatarsData) && avatarsData
                    .filter((a: any) => a.isActive)
                    .sort((a: any, b: any) => (a.sortOrder || 0) - (b.sortOrder || 0))
                    .map((avatar: any, index: number) => (
                      <div 
                        key={avatar.id}
                        className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/10"
                      >
                        <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0">
                          {avatarGifs[avatar.id] ? (
                            <img src={avatarGifs[avatar.id]} alt={avatar.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-primary flex items-center justify-center text-white font-bold">
                              {avatar.name.charAt(0)}
                            </div>
                          )}
                        </div>
                        <span className="text-white flex-1">{avatar.name}</span>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => moveAvatarUp(avatar.id)}
                            disabled={index === 0}
                          >
                            <ChevronUp className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => moveAvatarDown(avatar.id)}
                            disabled={index === avatarsData.filter((a: any) => a.isActive).length - 1}
                          >
                            <ChevronDown className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          </div>
        );

      case 'knowledge':
        return (
          <div className="p-4 sm:p-6 space-y-6">
            <h2 className="text-xl sm:text-2xl font-bold text-white mb-4">Knowledge Base</h2>
            <DocumentUpload />
            <DatabaseStatus />
          </div>
        );

      case 'courses':
        if (showCourseBuilder) {
          return <CourseBuilderPage />;
        }
        return (
          <div className="p-4 sm:p-6 space-y-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl sm:text-2xl font-bold text-white">Video Courses</h2>
              <Button onClick={() => setShowCourseBuilder(true)}>
                <Plus className="w-4 h-4 mr-2" />
                New Course
              </Button>
            </div>
            {Array.isArray(coursesData) && coursesData.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {coursesData.map((course: any) => (
                  <Card key={course.id} className="glass border-white/10">
                    <CardContent className="p-4">
                      <h3 className="font-semibold text-white truncate mb-2">{course.title}</h3>
                      <p className="text-sm text-gray-400 line-clamp-2 mb-3">{course.description}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-500">{course.lessons?.length || 0} lessons</span>
                        <Button size="sm" variant="outline" onClick={() => {
                          setEditingCourseId(course.id);
                          setShowCourseBuilder(true);
                        }}>
                          Edit
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="glass border-white/10">
                <CardContent className="p-8 text-center">
                  <Video className="w-12 h-12 mx-auto mb-4 text-gray-500" />
                  <p className="text-gray-400">No courses yet. Create your first course!</p>
                </CardContent>
              </Card>
            )}
          </div>
        );

      case 'users':
        return (
          <div className="p-4 sm:p-6 space-y-6">
            <h2 className="text-xl sm:text-2xl font-bold text-white mb-4">User Management</h2>
            {usersLoading ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="space-y-4">
                {usersData?.map((user) => (
                  <Card key={user.id} className="glass border-white/10">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-semibold text-white">
                            {user.firstName} {user.lastName}
                          </h3>
                          <p className="text-sm text-gray-400">{user.email}</p>
                        </div>
                        <div className="text-right">
                          <span className={`px-2 py-1 rounded text-xs ${user.role === 'admin' ? 'bg-purple-500/20 text-purple-300' : 'bg-gray-500/20 text-gray-300'}`}>
                            {user.role}
                          </span>
                          <p className="text-sm text-gray-500 mt-1">{user.currentPlan}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-5 gap-2 mt-3 text-center text-xs text-gray-400">
                        <div>
                          <p className="text-white font-bold">{user.usage.videosCreated}</p>
                          <p>Videos</p>
                        </div>
                        <div>
                          <p className="text-white font-bold">{user.usage.coursesCreated}</p>
                          <p>Courses</p>
                        </div>
                        <div>
                          <p className="text-white font-bold">{user.usage.chatSessionsUsed}</p>
                          <p>Chats</p>
                        </div>
                        <div>
                          <p className="text-white font-bold">{user.usage.moodEntriesLogged}</p>
                          <p>Moods</p>
                        </div>
                        <div>
                          <p className="text-white font-bold">{user.usage.creditsUsed}</p>
                          <p>Credits</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        );

      case 'analytics':
        return (
          <div className="p-4 sm:p-6">
            <Analytics />
          </div>
        );

      case 'credits':
        return (
          <div className="p-4 sm:p-6">
            <Credits />
          </div>
        );

      case 'dashboard':
      default:
        return (
          <div className="p-4 sm:p-6 space-y-6">
            <h2 className="text-xl sm:text-2xl font-bold text-white mb-4">Admin Dashboard</h2>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="glass border-white/10">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <Users className="w-8 h-8 text-primary" />
                    <div>
                      <p className="text-2xl font-bold text-white">{totalAvatars}</p>
                      <p className="text-sm text-gray-400">Active Avatars</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="glass border-white/10">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <FileText className="w-8 h-8 text-green-400" />
                    <div>
                      <p className="text-2xl font-bold text-white">{totalDocuments}</p>
                      <p className="text-sm text-gray-400">Documents</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="glass border-white/10">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <Activity className="w-8 h-8 text-purple-400" />
                    <div>
                      <p className="text-2xl font-bold text-white">{totalVectors}</p>
                      <p className="text-sm text-gray-400">Vectors</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="glass border-white/10">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <UserCog className="w-8 h-8 text-yellow-400" />
                    <div>
                      <p className="text-2xl font-bold text-white">{usersData?.length || 0}</p>
                      <p className="text-sm text-gray-400">Users</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="glass border-white/10">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <Video className="w-5 h-5" />
                    Recent Courses
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {Array.isArray(coursesData) && coursesData.length > 0 ? (
                    <div className="space-y-2">
                      {coursesData.slice(0, 5).map((course: any) => (
                        <div key={course.id} className="flex items-center justify-between p-2 rounded bg-white/5">
                          <span className="text-white truncate">{course.title}</span>
                          <span className="text-sm text-gray-400">{course.lessons?.length || 0} lessons</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-400 text-sm">No courses yet</p>
                  )}
                </CardContent>
              </Card>

              <Card className="glass border-white/10">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <Users className="w-5 h-5" />
                    Active Avatars
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {Array.isArray(avatarsData) && avatarsData
                      .filter((a: any) => a.isActive)
                      .slice(0, 6)
                      .map((avatar: any) => (
                        <div
                          key={avatar.id}
                          className="flex items-center gap-2 p-2 rounded bg-white/5"
                        >
                          <div className="w-8 h-8 rounded-full overflow-hidden">
                            {avatarGifs[avatar.id] ? (
                              <img src={avatarGifs[avatar.id]} alt={avatar.name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full bg-primary flex items-center justify-center text-white text-xs">
                                {avatar.name.charAt(0)}
                              </div>
                            )}
                          </div>
                          <span className="text-white text-sm">{avatar.name}</span>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-gray-900 to-black text-white">
      {renderContent()}
    </div>
  );
}
