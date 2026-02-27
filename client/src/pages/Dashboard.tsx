import { useAuth } from "@/hooks/useAuth";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
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
  CloudRain,
  Lock,
  Crown,
  GraduationCap,
  X,
} from "lucide-react";
import { Link, useLocation, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect, useMemo } from "react";
import { formatDistanceToNow } from "date-fns";
import type {
  AvatarProfile,
  Course,
  ChatGeneratedVideo,
  Lesson,
  GeneratedVideo,
  MoodEntry,
  MoodType,
  moodTypeEnum,
  SubscriptionPlan,
  UserSubscription,
  UsagePeriod,
} from "@shared/schema";
import { getNamespaceDisplayName } from "@shared/pineconeCategories";
import { Badge } from "@/components/ui/badge";

// Extended type for courses with lessons and video data from API
interface LessonWithVideo extends Lesson {
  video: GeneratedVideo | null;
}

interface CourseWithLessons extends Course {
  lessons: LessonWithVideo[];
}
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from "recharts";
import CourseBuilderPage from "./course-builder";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMutation } from "@tanstack/react-query";
import { AvatarChat } from "@/components/avatar-chat";

export type UserView =
  | "dashboard"
  | "chat"
  | "active-chat"
  | "videos"
  | "courses"
  | "course-view"
  | "course-edit"
  | "credits"
  | "settings"
  | "mood"
  | "plan";

const avatarGifs: Record<string, string> = {
  "mark-kohl": "/attached_assets/MArk-kohl-loop_1763964600000.gif",
  "willie-gault": "/attached_assets/Willie gault gif-low_1763964813725.gif",
  june: "/attached_assets/June-low_1764106896823.gif",
  thad: "/attached_assets/Thad_1763963906199.gif",
  nigel: "/attached_assets/Nigel-Loop-avatar_1763964600000.gif",
  ann: "/attached_assets/Ann_1763966361095.gif",
  kelsey: "/attached_assets/Kelsey_1764111279103.gif",
  judy: "/attached_assets/Screen Recording 2025-07-14 at 14.35.37-low_1764106921758.gif",
  dexter:
    "/attached_assets/DexterDoctor-ezgif.com-loop-count_1764111811631.gif",
  shawn:
    "/attached_assets/Screen Recording 2025-07-14 at 14.41.54-low_1764106970821.gif",
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
  status: "ok" | "warning" | "critical";
}

interface UserPlanInfo {
  plan: SubscriptionPlan | null;
  subscription: UserSubscription | null;
  usage: UsagePeriod | null;
  isExpired: boolean;
  canUseFeatures: boolean;
  selectedAvatarId: string | null;
  limits: {
    videosRemaining: number | null;
    coursesRemaining: number | null;
    chatSessionsRemaining: number | null;
    maxLessonsPerCourse: number | null;
  };
}

interface DashboardProps {
  isEmbed?: boolean;
  embedView?: UserView;
  embedAvatarId?: string;
  embedCourseId?: string;
}

export default function Dashboard({
  isEmbed = false,
  embedView,
  embedAvatarId,
  embedCourseId,
}: DashboardProps = {}) {
  const { isAuthenticated, isLoading, user, isAdmin } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(!isEmbed);
  const [location, setLocation] = useLocation();

  const [, chatParams] = useRoute("/dashboard/chat/:avatarId");
  const [, mentorParams] = useRoute("/dashboard/mentors/:avatarId");
  const [, shortMentorParams] = useRoute("/mentors/:avatarId");
  const [, courseViewParams] = useRoute("/dashboard/courses/:courseId");
  const [, courseEditParams] = useRoute("/dashboard/courses/:courseId/edit");

  const currentView = useMemo((): UserView => {
    if (isEmbed && embedView) {
      if (embedView === "chat" && embedAvatarId) return "active-chat";
      return embedView;
    }
    // Support both /chat and /mentors paths for avatar selection
    if (location.startsWith("/dashboard/chat/") && chatParams?.avatarId)
      return "active-chat";
    if (location.startsWith("/dashboard/mentors/") && mentorParams?.avatarId)
      return "active-chat";
    if (location.startsWith("/mentors/") && shortMentorParams?.avatarId)
      return "active-chat";
    if (location === "/dashboard/chat" || location === "/dashboard/mentors" || location === "/mentors") return "chat";
    if (location === "/dashboard/courses/new/edit") return "course-edit";
    if (location.endsWith("/edit") && courseEditParams?.courseId)
      return "course-edit";
    if (
      location.startsWith("/dashboard/courses/") &&
      courseViewParams?.courseId &&
      !location.endsWith("/edit")
    )
      return "course-view";
    if (location === "/dashboard/courses" || location.startsWith("/dashboard/courses?")) return "courses";
    if (location === "/dashboard/videos") return "videos";
    if (location === "/dashboard/mood") return "mood";
    if (location === "/dashboard/plan") return "plan";
    if (location === "/dashboard/credits") return "credits";
    if (location === "/dashboard/settings") return "settings";
    return "dashboard";
  }, [location, chatParams, mentorParams, shortMentorParams, courseViewParams, courseEditParams, isEmbed, embedView, embedAvatarId]);

  const activeChatAvatarId = isEmbed && embedAvatarId ? embedAvatarId : (chatParams?.avatarId || mentorParams?.avatarId || shortMentorParams?.avatarId || null);
  
  // Parse avatar filter from query params for courses view
  const avatarFilterId = useMemo(() => {
    const searchParams = new URLSearchParams(window.location.search);
    return searchParams.get('avatar');
  }, [location]);

  const selectedCourseId = isEmbed && embedCourseId
    ? embedCourseId
    : (location === "/dashboard/courses/new/edit"
        ? null
        : courseViewParams?.courseId || courseEditParams?.courseId || null);

  const { data: chatVideos, isLoading: videosLoading } = useQuery<ChatVideo[]>({
    queryKey: ["/api/courses/chat-videos"],
    enabled: isAuthenticated,
  });

  const { data: avatars, isLoading: avatarsLoading } = useQuery<
    AvatarProfile[]
  >({
    queryKey: ["/api/avatars"],
  });

  const { data: courses, isLoading: coursesLoading } = useQuery<
    CourseWithLessons[]
  >({
    queryKey: ["/api/courses"],
    enabled: isAuthenticated,
  });

  const {
    data: moodEntries,
    isLoading: moodLoading,
    refetch: refetchMood,
  } = useQuery<MoodEntry[]>({
    queryKey: ["/api/mood"],
    enabled: isAuthenticated,
  });

  const { data: heygenStats, isLoading: creditsLoading } =
    useQuery<CreditStats>({
      queryKey: ["/api/heygen/credits"],
      enabled: isAuthenticated,
      refetchInterval: 30000,
    });

  const {
    data: planInfo,
    isLoading: planLoading,
    refetch: refetchPlan,
  } = useQuery<UserPlanInfo>({
    queryKey: ["/api/subscription/user-plan"],
    enabled: isAuthenticated,
  });

  const { data: allPlans } = useQuery<SubscriptionPlan[]>({
    queryKey: ["/api/subscription/plans"],
  });

  const { toast } = useToast();
  const [selectedAvatarId, setSelectedAvatarId] = useState<string>("");
  const [selectedVideo, setSelectedVideo] = useState<ChatVideo | null>(null);
  const [deletingVideoId, setDeletingVideoId] = useState<string | null>(null);

  const [selectedMood, setSelectedMood] = useState<MoodType | null>(null);
  const [moodIntensity, setMoodIntensity] = useState<number>(3);
  const [moodNotes, setMoodNotes] = useState<string>("");
  const [lastMoodResponse, setLastMoodResponse] = useState<{
    mood: string;
    response: string;
  } | null>(null);
  const [videoToDelete, setVideoToDelete] = useState<ChatVideo | null>(null);

  // Generate or get user ID for chat
  const [chatUserId] = useState(() => {
    let storedUserId = localStorage.getItem("temp-user-id");
    if (!storedUserId) {
      storedUserId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem("temp-user-id", storedUserId);
    }
    return storedUserId;
  });

  const moodMutation = useMutation({
    mutationFn: async (data: {
      mood: MoodType;
      intensity: number;
      notes?: string;
      avatarId?: string;
    }) => {
      const response = await apiRequest("/api/mood", "POST", data);
      return response.json();
    },
    onSuccess: (data: MoodEntry) => {
      setLastMoodResponse({
        mood: data.mood,
        response: data.avatarResponse || "",
      });
      setSelectedMood(null);
      setMoodIntensity(3);
      setMoodNotes("");
      queryClient.invalidateQueries({ queryKey: ["/api/mood"] });
      toast({
        title: "Mood logged!",
        description: "Your emotional wellness has been recorded.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to log your mood. Please try again.",
        variant: "destructive",
      });
    },
  });

  const startTrialMutation = useMutation({
    mutationFn: async (avatarId: string) => {
      const response = await apiRequest(
        "/api/subscription/start-trial",
        "POST",
        { avatarId },
      );
      return response.json();
    },
    onSuccess: () => {
      refetchPlan();
      toast({
        title: "Trial Started!",
        description: "Your 1-hour free trial has begun.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to start trial",
        variant: "destructive",
      });
    },
  });

  const selectAvatarMutation = useMutation({
    mutationFn: async (avatarId: string) => {
      const response = await apiRequest(
        "/api/subscription/select-avatar",
        "POST",
        { avatarId },
      );
      return response.json();
    },
    onSuccess: () => {
      refetchPlan();
      toast({
        title: "Avatar Selected!",
        description: "You can now chat with this avatar.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to select avatar",
        variant: "destructive",
      });
    },
  });

  const upgradePlanMutation = useMutation({
    mutationFn: async (planSlug: string) => {
      const response = await apiRequest("/api/subscription/upgrade", "POST", {
        planSlug,
      });
      return response.json();
    },
    onSuccess: () => {
      refetchPlan();
      toast({
        title: "Plan Upgraded!",
        description: "Your subscription has been updated.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to upgrade plan",
        variant: "destructive",
      });
    },
  });

  const deleteVideoMutation = useMutation({
    mutationFn: async (videoId: number) => {
      const response = await apiRequest(`/api/courses/chat-videos/${videoId}`, "DELETE");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/courses/chat-videos"] });
      setVideoToDelete(null);
      toast({
        title: "Video Deleted",
        description: "The video has been removed.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete video",
        variant: "destructive",
      });
    },
  });

  // Profile editing state
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");

  // Initialize edit form when user data loads
  useEffect(() => {
    if (user) {
      setEditFirstName(user.firstName || "");
      setEditLastName(user.lastName || "");
    }
  }, [user]);

  const updateProfileMutation = useMutation({
    mutationFn: async (data: { firstName: string; lastName: string }) => {
      const response = await apiRequest("/api/auth/user/profile", "PATCH", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      setIsEditingProfile(false);
      toast({
        title: "Profile Updated",
        description: "Your profile has been saved successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update profile",
        variant: "destructive",
      });
    },
  });

  const handleSaveProfile = () => {
    updateProfileMutation.mutate({
      firstName: editFirstName.trim(),
      lastName: editLastName.trim(),
    });
  };

  const handleCancelEdit = () => {
    setIsEditingProfile(false);
    setEditFirstName(user?.firstName || "");
    setEditLastName(user?.lastName || "");
  };

  const completedVideos =
    chatVideos?.filter((v) => v.status === "completed") || [];
  const pendingVideos =
    chatVideos?.filter(
      (v) => v.status === "pending" || v.status === "generating",
    ) || [];
  const failedVideos = chatVideos?.filter((v) => v.status === "failed") || [];

  // Check if an avatar is locked based on subscription
  const isAvatarLocked = (avatarId: string): boolean => {
    // No subscription = no access (should start trial first)
    if (!planInfo?.subscription) {
      return true;
    }

    // Expired subscription = all locked
    if (planInfo.isExpired) {
      return true;
    }

    // Pro plan (null avatarLimit) = unlimited access
    if (planInfo.plan?.avatarLimit === null) {
      return false;
    }

    // Free trial or Basic plan with 1 avatar limit
    if (planInfo.plan?.avatarLimit === 1) {
      // Only the selected avatar is unlocked
      return avatarId !== planInfo.selectedAvatarId;
    }

    return false;
  };

  // Auto-collapse sidebar on mobile (only when not in embed mode)
  useEffect(() => {
    if (isEmbed) return;
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setSidebarOpen(false);
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [isEmbed]);

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

  // In embedded mode (Webflow), authentication is always true
  // No need to show login screen - handled by Webflow externally

  const viewToPath: Record<UserView, string> = {
    dashboard: "/dashboard",
    chat: "/dashboard/chat",
    "active-chat": "/dashboard/chat",
    videos: "/dashboard/videos",
    courses: "/dashboard/courses",
    "course-view": "/dashboard/courses",
    "course-edit": "/dashboard/courses",
    mood: "/dashboard/mood",
    plan: "/dashboard/plan",
    credits: "/dashboard/credits",
    settings: "/dashboard/settings",
  };

  const NavButton = ({
    view,
    icon: Icon,
    label,
  }: {
    view: UserView;
    icon: any;
    label: string;
  }) => {
    const isActive =
      currentView === view ||
      (view === "chat" && currentView === "active-chat") ||
      (view === "courses" &&
        (currentView === "course-view" || currentView === "course-edit"));

    return (
      <Link href={viewToPath[view]}>
        <Button
          variant={isActive ? "default" : "ghost"}
          className={`w-full justify-start transition-all duration-300 ${sidebarOpen ? "" : "justify-center px-2"}`}
          onClick={() => {
            if (window.innerWidth < 768) setSidebarOpen(false);
          }}
          data-testid={`nav-${view}`}
          title={!sidebarOpen ? label : undefined}
        >
          <Icon className={`w-4 h-4 ${sidebarOpen ? "mr-3" : ""}`} />
          <span className={`transition-all duration-300 ${sidebarOpen ? "opacity-100" : "opacity-0 w-0 overflow-hidden"}`}>
            {label}
          </span>
        </Button>
      </Link>
    );
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="w-4 h-4 text-green-400" />;
      case "generating":
        return <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />;
      case "pending":
        return <Clock className="w-4 h-4 text-yellow-400" />;
      case "failed":
        return <AlertCircle className="w-4 h-4 text-red-400" />;
      default:
        return <Clock className="w-4 h-4 text-white/50" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "completed":
        return "Ready to watch";
      case "generating":
        return "Generating...";
      case "pending":
        return "Pending";
      case "failed":
        return "Failed";
      default:
        return status;
    }
  };

  return (
    <div className={`flex h-screen bg-background ${isEmbed ? '' : 'dot-pattern'} overflow-hidden`}>
      {/* Floating orbs for ambiance - hidden in embed mode */}
      {!isEmbed && (
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-10 w-72 h-72 bg-purple-500/20 rounded-full blur-[100px] animate-float" />
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-cyan-500/20 rounded-full blur-[120px] animate-float-delayed" />
        </div>
      )}

      {/* Mobile Overlay - hidden in embed mode */}
      {!isEmbed && sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden transition-opacity duration-300"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - hidden in embed mode */}
      {!isEmbed && (
        <aside
          className={`
            fixed md:relative z-50 h-full
            border-r bg-card/95 backdrop-blur-sm flex flex-col flex-shrink-0
            transition-all duration-300 ease-in-out
            ${sidebarOpen ? "w-64 translate-x-0" : "-translate-x-full md:translate-x-0 md:w-16"}
          `}
        >
        <div
          className={`p-4 border-b flex items-center ${sidebarOpen ? "justify-between" : "justify-center"}`}
        >
          {sidebarOpen && (
            <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent transition-opacity duration-300">
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
            {sidebarOpen ? (
              <ChevronLeft className="w-5 h-5" />
            ) : (
              <Menu className="w-5 h-5" />
            )}
          </Button>
        </div>

        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          <NavButton
            view="dashboard"
            icon={LayoutDashboard}
            label="Dashboard"
          />
          <NavButton view="chat" icon={MessageSquare} label="Avatar Chat" />
          <NavButton view="videos" icon={Video} label="My Videos" />
          <NavButton view="courses" icon={BookOpen} label="Video Courses" />
          <NavButton view="mood" icon={Heart} label="Mood Tracker" />
          <NavButton view="plan" icon={CreditCard} label="My Plan" />
          <NavButton view="credits" icon={DollarSign} label="Credits" />
          <NavButton view="settings" icon={Settings} label="Settings" />
        </nav>

        <div className="p-2 border-t space-y-1">
          {isAdmin && (
            <Button
              variant="ghost"
              className={`w-full justify-start transition-all duration-300 ${sidebarOpen ? "" : "justify-center px-2"}`}
              onClick={() => setLocation("/admin")}
              data-testid="nav-admin"
              title={!sidebarOpen ? "Admin Panel" : undefined}
            >
              <Shield
                className={`w-4 h-4 ${sidebarOpen ? "mr-3" : ""} text-purple-400`}
              />
              <span className={`transition-all duration-300 ${sidebarOpen ? "opacity-100" : "opacity-0 w-0 overflow-hidden"}`}>
                Admin Panel
              </span>
            </Button>
          )}

          <Button
            variant="ghost"
            className={`w-full justify-start transition-all duration-300 ${sidebarOpen ? "" : "justify-center px-2"}`}
            onClick={() => setLocation("/chat")}
            data-testid="nav-home"
            title={!sidebarOpen ? "Back to Home" : undefined}
          >
            <Home className={`w-4 h-4 ${sidebarOpen ? "mr-3" : ""}`} />
            <span className={`transition-all duration-300 ${sidebarOpen ? "opacity-100" : "opacity-0 w-0 overflow-hidden"}`}>
              Back to Home
            </span>
          </Button>

          {/* Logout button hidden in embedded mode - auth handled by Webflow */}
        </div>
      </aside>
      )}

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
                My Dashboard
              </h1>
            </div>
          </div>
        )}

        {/* Active Chat View - True Full Screen overlay (z-[100] to be above sidebar z-50) */}
        {currentView === "active-chat" && activeChatAvatarId && (
          <div 
            className="fixed inset-0 z-[100] bg-black w-screen h-screen"
            style={{ minHeight: '100dvh', height: '100dvh' }}
          >
            <AvatarChat userId={chatUserId} avatarId={activeChatAvatarId} />
          </div>
        )}

        {/* Regular content with padding - hidden during active chat */}
        {currentView !== "active-chat" && (
          <div className="p-4 sm:p-6 lg:p-8">
            {/* Header */}
            <div className="mb-6 sm:mb-8">
              <h2 className="text-2xl sm:text-3xl font-bold mb-2 text-white">
                Welcome,{" "}
                <span className="bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">
                  {user?.firstName || user?.email || "User"}
                </span>
              </h2>
              <p className="text-sm sm:text-base text-white/60">
                {currentView === "dashboard" &&
                  "Your personal dashboard - chat with avatars and view your videos"}
                {currentView === "chat" &&
                  "Choose an AI avatar to start a conversation"}
                {currentView === "videos" &&
                  "Videos generated from your chat conversations"}
                {currentView === "courses" &&
                  "Create and manage video courses with AI avatars"}
                {currentView === "course-view" && "Watch your course videos"}
                {currentView === "course-edit" && "Edit your video course"}
                {currentView === "plan" &&
                  "Manage your subscription and view your current plan"}
                {currentView === "credits" &&
                  "Track your API credit usage across services"}
                {currentView === "mood" &&
                  "Track your emotional wellness and get personalized support"}
                {currentView === "settings" && "Manage your account settings"}
              </p>
            </div>

            {/* Dashboard View */}
            {currentView === "dashboard" && (
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
                        Start a conversation with AI avatars and get
                        personalized responses.
                      </p>
                      <Button
                        className="w-full"
                        onClick={() => setLocation(isEmbed ? "/embed/chat" : "/dashboard/chat")}
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
                        View and download videos generated from your
                        conversations.
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          className="flex-1"
                          variant="secondary"
                          onClick={() => setLocation(isEmbed ? "/embed/videos" : "/dashboard/videos")}
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
                          <span className="text-sm text-white/60">
                            Completed Videos
                          </span>
                          <span className="text-xl font-bold text-green-400">
                            {completedVideos.length}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-white/60">
                            In Progress
                          </span>
                          <span className="text-xl font-bold text-cyan-400">
                            {pendingVideos.length}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Features Overview */}
                <h3 className="text-lg font-semibold text-white mb-4">
                  Features
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                  <Card 
                    className="glass border-white/10 hover:border-purple-500/30 transition-all duration-300 group cursor-pointer card-hover"
                    onClick={() => setLocation(isEmbed ? "/embed/chat" : "/dashboard/chat")}
                    data-testid="feature-card-conversations"
                  >
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
                        Have natural voice and text conversations with
                        personalized AI avatars.
                      </p>
                    </CardContent>
                  </Card>

                  <Card 
                    className="glass border-white/10 hover:border-cyan-500/30 transition-all duration-300 group cursor-pointer card-hover"
                    onClick={() => setLocation(isEmbed ? "/embed/videos" : "/dashboard/videos")}
                    data-testid="feature-card-videos"
                  >
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
                        Request custom videos during chat - just ask the avatar
                        to make a video.
                      </p>
                    </CardContent>
                  </Card>

                  <Card 
                    className="glass border-white/10 hover:border-green-500/30 transition-all duration-300 group cursor-pointer card-hover"
                    onClick={() => setLocation(isEmbed ? "/embed/courses" : "/dashboard/courses")}
                    data-testid="feature-card-courses"
                  >
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
                        Avatars access specialized knowledge for accurate,
                        contextual responses.
                      </p>
                    </CardContent>
                  </Card>

                  <Card 
                    className="glass border-white/10 hover:border-orange-500/30 transition-all duration-300 group cursor-pointer card-hover"
                    onClick={() => setLocation(isEmbed ? "/embed/chat" : "/dashboard/chat")}
                    data-testid="feature-card-avatars"
                  >
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
                        Choose from various AI avatars, each with unique
                        expertise.
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </>
            )}

            {/* Chat View - Avatar Selection */}
            {currentView === "chat" && (
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
                      <CardTitle className="text-white">
                        No Avatars Available
                      </CardTitle>
                      <CardDescription className="text-white/60">
                        There are no AI avatars configured at the moment. Please
                        check back later.
                      </CardDescription>
                    </CardHeader>
                  </Card>
                ) : (
                  <>
                    {planInfo?.plan?.avatarLimit === 1 &&
                      planInfo?.selectedAvatarId && (
                        <p className="text-purple-400 text-sm mb-4 text-center">
                          Your plan includes 1 avatar.{" "}
                          <button
                            onClick={() => setLocation(isEmbed ? "/embed/plan" : "/dashboard/plan")}
                            className="underline hover:text-purple-300"
                          >
                            Upgrade to Pro
                          </button>{" "}
                          for unlimited access.
                        </p>
                      )}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                      {avatars.map((avatar) => {
                        const locked = isAvatarLocked(avatar.id);
                        const isSelectedAvatar =
                          planInfo?.selectedAvatarId === avatar.id;

                        return (
                          <Card
                            key={avatar.id}
                            onClick={() =>
                              !locked && setSelectedAvatarId(avatar.id)
                            }
                            className={`transition-all duration-300 flex flex-col h-full glass-strong group relative ${
                              locked
                                ? "opacity-60 cursor-not-allowed border-gray-700"
                                : selectedAvatarId === avatar.id
                                  ? "cursor-pointer border-purple-500/50 ring-2 ring-purple-500/30 card-hover"
                                  : "cursor-pointer border-white/10 hover:border-purple-500/30 card-hover"
                            }`}
                            data-testid={`card-avatar-${avatar.id}`}
                          >
                            {locked && (
                              <div className="absolute inset-0 bg-black/50 z-10 rounded-lg flex items-center justify-center">
                                <div className="text-center">
                                  <Lock className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                                  <p className="text-gray-400 text-sm">
                                    Upgrade to unlock
                                  </p>
                                </div>
                              </div>
                            )}

                            <CardHeader className="p-5 sm:p-4 md:p-5 flex-1 flex flex-col">
                              <div className="flex flex-col h-full">
                                {/* Avatar Image/GIF - larger on mobile */}
                                <div className="w-full aspect-square sm:aspect-square rounded-xl overflow-hidden bg-gradient-to-br from-purple-500/20 to-cyan-500/20 flex items-center justify-center mb-4 group-hover:scale-[1.02] transition-transform">
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
                                    <CardTitle className="text-white text-xl sm:text-lg md:text-xl mb-2 flex items-center gap-2">
                                      {avatar.name}
                                      {isSelectedAvatar && (
                                        <Crown className="w-5 h-5 sm:w-4 sm:h-4 text-yellow-400" />
                                      )}
                                    </CardTitle>

                                    {/* Description */}
                                    <CardDescription className="text-white/60 text-sm sm:text-xs md:text-sm mb-3 line-clamp-3 min-h-[3.5rem]">
                                      {avatar.description}
                                    </CardDescription>

                                    {/* Knowledge Categories */}
                                    <div className="flex flex-wrap gap-2 sm:gap-1.5 mb-4 min-h-[2.5rem]">
                                      {avatar.pineconeNamespaces &&
                                        avatar.pineconeNamespaces.length > 0 &&
                                        avatar.pineconeNamespaces
                                          .map((ns) => getNamespaceDisplayName(ns, avatar.id))
                                          .filter((name): name is string => name !== null)
                                          .map((displayName, index) => (
                                            <span
                                              key={index}
                                              className="text-sm sm:text-xs px-3 sm:px-2 py-1 sm:py-0.5 bg-purple-500/20 text-purple-300 rounded-full border border-purple-500/30 h-fit"
                                            >
                                              {displayName}
                                            </span>
                                          ))}
                                    </div>

                                    {/* Buttons */}
                                    <div className="mt-auto space-y-2">
                                      <Button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (locked) {
                                            setLocation(isEmbed ? "/embed/plan" : "/dashboard/plan");
                                          } else {
                                            setLocation(
                                              isEmbed ? `/embed/chat/${avatar.id}` : `/dashboard/chat/${avatar.id}`,
                                            );
                                          }
                                        }}
                                        className={`w-full font-semibold py-3 sm:py-2.5 text-base sm:text-sm rounded-lg transition-all duration-200 shadow-lg ${
                                          locked
                                            ? "bg-gray-700 hover:bg-gray-600 text-gray-300 shadow-none z-20 relative"
                                            : "bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-700 hover:to-cyan-700 text-white hover:scale-[1.02] shadow-purple-500/20"
                                        }`}
                                        data-testid={`button-chat-${avatar.id}`}
                                      >
                                        {locked ? (
                                          <>
                                            <Lock className="w-5 h-5 sm:w-4 sm:h-4 mr-2" />
                                            Upgrade to Unlock
                                          </>
                                        ) : (
                                          <>
                                            <MessageSquare className="w-5 h-5 sm:w-4 sm:h-4 mr-2" />
                                            Start Chat
                                          </>
                                        )}
                                      </Button>
                                      <Button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (!locked) {
                                            setLocation(isEmbed ? `/embed/courses?avatar=${avatar.id}` : `/dashboard/courses?avatar=${avatar.id}`);
                                          }
                                        }}
                                        variant="outline"
                                        className={`w-full font-semibold py-3 sm:py-2.5 text-base sm:text-sm rounded-lg transition-all duration-200 ${
                                          locked 
                                            ? "border-gray-700 text-gray-500 cursor-not-allowed"
                                            : "border-purple-500/30 text-purple-300 hover:bg-purple-500/10 hover:border-purple-500/50 hover:scale-[1.02]"
                                        }`}
                                        disabled={locked}
                                        data-testid={`button-courses-${avatar.id}`}
                                      >
                                        <GraduationCap className="w-5 h-5 sm:w-4 sm:h-4 mr-2" />
                                        Courses
                                      </Button>
                                    </div>
                                  </div>

                                  {/* Selection Check Mark */}
                                  {selectedAvatarId === avatar.id &&
                                    !locked && (
                                      <div className="absolute top-0 right-0 w-7 h-7 rounded-full bg-gradient-primary flex items-center justify-center glow-primary">
                                        <Check className="w-4 h-4 text-white" />
                                      </div>
                                    )}
                                </div>
                              </div>
                            </CardHeader>
                          </Card>
                        );
                      })}
                    </div>
                  </>
                )}
              </>
            )}

            {/* Videos View */}
            {currentView === "videos" && (
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
                      <CardTitle className="text-white">
                        No Videos Yet
                      </CardTitle>
                      <CardDescription className="text-white/60">
                        You haven't created any videos yet. Start a chat with an
                        avatar and ask them to create a video about a topic!
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex justify-center">
                      <Button
                        onClick={() => setLocation(isEmbed ? "/embed/chat" : "/dashboard/chat")}
                        data-testid="button-start-chat-empty"
                      >
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
                            <Card
                              key={video.id}
                              className="overflow-hidden glass-strong border-cyan-500/20 group"
                              data-testid={`card-video-${video.id}`}
                            >
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
                                <h4 className="font-medium text-white truncate mb-2">
                                  {video.topic}
                                </h4>
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2 text-sm text-white/60">
                                    {getStatusIcon(video.status)}
                                    <span>{getStatusText(video.status)}</span>
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-red-400/70 hover:text-red-400 hover:bg-red-500/10"
                                    onClick={() => setVideoToDelete(video)}
                                    data-testid={`button-delete-${video.id}`}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                                <p className="text-xs text-white/40 mt-2">
                                  Started{" "}
                                  {formatDistanceToNow(
                                    new Date(video.createdAt),
                                    { addSuffix: true },
                                  )}
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
                            <Card
                              key={video.id}
                              className="overflow-hidden glass-strong border-green-500/20 hover:border-green-500/40 transition-all duration-300 group card-hover"
                              data-testid={`card-video-${video.id}`}
                            >
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
                                <h4 className="font-medium text-white truncate mb-2">
                                  {video.topic}
                                </h4>
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2 text-sm text-green-400">
                                    {getStatusIcon(video.status)}
                                    <span>{getStatusText(video.status)}</span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    {video.videoUrl && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-white/70 hover:text-white"
                                        asChild
                                        data-testid={`button-download-${video.id}`}
                                      >
                                        <a
                                          href={video.videoUrl}
                                          download
                                          target="_blank"
                                          rel="noopener noreferrer"
                                        >
                                          <Download className="w-4 h-4" />
                                        </a>
                                      </Button>
                                    )}
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="text-red-400/70 hover:text-red-400 hover:bg-red-500/10"
                                      onClick={() => setVideoToDelete(video)}
                                      data-testid={`button-delete-${video.id}`}
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </div>
                                </div>
                                <p className="text-xs text-white/40 mt-2">
                                  Completed{" "}
                                  {video.completedAt
                                    ? formatDistanceToNow(
                                        new Date(video.completedAt),
                                        { addSuffix: true },
                                      )
                                    : formatDistanceToNow(
                                        new Date(video.createdAt),
                                        { addSuffix: true },
                                      )}
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
                            <Card
                              key={video.id}
                              className="overflow-hidden glass-strong border-red-500/20"
                              data-testid={`card-video-${video.id}`}
                            >
                              <div className="aspect-video bg-gradient-to-br from-red-500/10 to-rose-500/10 flex items-center justify-center">
                                <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center">
                                  <AlertCircle className="w-8 h-8 text-red-400" />
                                </div>
                              </div>
                              <CardContent className="p-4">
                                <h4 className="font-medium text-white truncate mb-2">
                                  {video.topic}
                                </h4>
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2 text-sm text-red-400">
                                    {getStatusIcon(video.status)}
                                    <span>{getStatusText(video.status)}</span>
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-red-400/70 hover:text-red-400 hover:bg-red-500/10"
                                    onClick={() => setVideoToDelete(video)}
                                    data-testid={`button-delete-${video.id}`}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                                <p className="text-xs text-white/40 mt-2">
                                  {formatDistanceToNow(
                                    new Date(video.createdAt),
                                    { addSuffix: true },
                                  )}
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
            {currentView === "courses" && (
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
                  <>
                    {/* Show avatar filter indicator even when no courses exist */}
                    {avatarFilterId && (
                      <div className="flex items-center gap-2 glass px-4 py-2 rounded-lg border border-purple-500/30 w-fit mb-6">
                        <span className="text-white/60 text-sm">Showing courses by:</span>
                        <span className="text-purple-300 font-medium">
                          {avatars?.find(a => a.id === avatarFilterId)?.name || avatarFilterId}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            window.location.href = isEmbed ? "/embed/courses" : "/dashboard/courses";
                          }}
                          className="ml-2 w-6 h-6 flex items-center justify-center rounded-full hover:bg-white/10 text-white/40 hover:text-white transition-colors cursor-pointer"
                          data-testid="button-clear-avatar-filter-empty"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                    <Card className="max-w-lg mx-auto glass-strong border-purple-500/30">
                      <CardHeader className="text-center">
                        <div className="w-16 h-16 rounded-full bg-gradient-primary/20 flex items-center justify-center mx-auto mb-4">
                          <BookOpen className="w-8 h-8 text-purple-400" />
                        </div>
                        <CardTitle className="text-white">
                          {avatarFilterId 
                            ? `No Courses for ${avatars?.find(a => a.id === avatarFilterId)?.name || 'This Mentor'}`
                            : "No Courses Yet"}
                        </CardTitle>
                        <CardDescription className="text-white/60">
                          {avatarFilterId
                            ? `${avatars?.find(a => a.id === avatarFilterId)?.name || 'This mentor'} doesn't have any courses yet.`
                            : "Video courses will appear here once they are created."}
                        </CardDescription>
                      </CardHeader>
                      {avatarFilterId && (
                        <CardContent className="flex justify-center">
                          <Button
                            variant="outline"
                            onClick={() => {
                              window.location.href = isEmbed ? "/embed/courses" : "/dashboard/courses";
                            }}
                            data-testid="button-view-all-courses-empty"
                          >
                            View All Courses
                          </Button>
                        </CardContent>
                      )}
                    </Card>
                  </>
                ) : (
                  <>
                    {/* Filter indicator and controls */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                      {avatarFilterId && (
                        <div className="flex items-center gap-2 glass px-4 py-2 rounded-lg border border-purple-500/30">
                          <span className="text-white/60 text-sm">Showing courses by:</span>
                          <span className="text-purple-300 font-medium">
                            {avatars?.find(a => a.id === avatarFilterId)?.name || avatarFilterId}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              window.location.href = isEmbed ? "/embed/courses" : "/dashboard/courses";
                            }}
                            className="ml-2 w-6 h-6 flex items-center justify-center rounded-full hover:bg-white/10 text-white/40 hover:text-white transition-colors cursor-pointer"
                            data-testid="button-clear-avatar-filter"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                    {avatarFilterId && courses.filter(course => course.avatarId === avatarFilterId).length === 0 ? (
                      <Card className="max-w-lg mx-auto glass-strong border-purple-500/30">
                        <CardHeader className="text-center">
                          <div className="w-16 h-16 rounded-full bg-gradient-primary/20 flex items-center justify-center mx-auto mb-4">
                            <BookOpen className="w-8 h-8 text-purple-400" />
                          </div>
                          <CardTitle className="text-white">
                            No Courses for This Mentor
                          </CardTitle>
                          <CardDescription className="text-white/60">
                            {avatars?.find(a => a.id === avatarFilterId)?.name || 'This mentor'} doesn't have any courses yet.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="flex justify-center">
                          <Button
                            variant="outline"
                            onClick={() => {
                              window.location.href = isEmbed ? "/embed/courses" : "/dashboard/courses";
                            }}
                            data-testid="button-view-all-courses"
                          >
                            View All Courses
                          </Button>
                        </CardContent>
                      </Card>
                    ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                      {(avatarFilterId 
                        ? courses.filter(course => course.avatarId === avatarFilterId)
                        : courses
                      ).map((course) => (
                        <Card
                          key={course.id}
                          className="glass-strong border-white/10 hover:border-purple-500/30 transition-all duration-300 cursor-pointer group card-hover overflow-hidden flex flex-col"
                          onClick={() =>
                            setLocation(isEmbed ? `/embed/courses/${course.id}` : `/dashboard/courses/${course.id}`)
                          }
                          data-testid={`card-course-${course.id}`}
                        >
                          {/* Thumbnail - use first lesson's video thumbnail or course thumbnail */}
                          <div className="relative aspect-video bg-gradient-to-br from-purple-500/20 to-cyan-500/20 overflow-hidden">
                            {(() => {
                              // Get thumbnail from first completed lesson's video, or fallback to course thumbnail
                              const firstVideoThumbnail = course.lessons?.find(
                                (l) => l.video?.thumbnailUrl,
                              )?.video?.thumbnailUrl;
                              const thumbnailUrl =
                                course.thumbnailUrl || firstVideoThumbnail;

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
                              <Badge
                                className={`text-xs ${
                                  course.status === "completed"
                                    ? "bg-green-500/80 text-white"
                                    : course.status === "generating"
                                      ? "bg-yellow-500/80 text-white"
                                      : "bg-gray-500/80 text-white"
                                }`}
                              >
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
                                <span>
                                  {avatars?.find(
                                    (a) => a.id === course.avatarId,
                                  )?.name || course.avatarId}
                                </span>
                              </div>
                              {course.totalDuration > 0 && (
                                <div className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  <span>
                                    {Math.floor(course.totalDuration / 60)}:
                                    {(course.totalDuration % 60)
                                      .toString()
                                      .padStart(2, "0")}
                                  </span>
                                </div>
                              )}
                            </div>
                            {!isEmbed && isAdmin && (
                              <div className="mt-auto pt-3 border-t border-white/10">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="w-full border-purple-500/30 text-purple-300 hover:bg-purple-500/20 hover:text-white"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setLocation(
                                      `/dashboard/courses/${course.id}/edit`,
                                    );
                                  }}
                                  data-testid={`button-edit-course-${course.id}`}
                                >
                                  <Settings className="w-4 h-4 mr-2" />
                                  Edit Course
                                </Button>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                    )}
                  </>
                )}
              </>
            )}

            {/* Plan View */}
            {currentView === "plan" && (
              <div className="space-y-6">
                {planLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
                  </div>
                ) : (
                  <>
                    {/* Current Plan Card */}
                    <Card className="glass-strong border-purple-500/30">
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle className="text-white text-xl flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg bg-gradient-primary flex items-center justify-center">
                                <CreditCard className="w-5 h-5 text-white" />
                              </div>
                              {planInfo?.plan?.name || "No Plan"}
                            </CardTitle>
                            <CardDescription className="text-white/60 mt-2">
                              {planInfo?.plan?.description ||
                                "Start your free trial to access AI avatars"}
                            </CardDescription>
                          </div>
                          <Badge
                            className={`text-sm px-3 py-1 ${
                              planInfo?.isExpired
                                ? "bg-red-500/20 text-red-300"
                                : planInfo?.subscription?.status === "active"
                                  ? "bg-green-500/20 text-green-300"
                                  : planInfo?.subscription?.status === "trial"
                                    ? "bg-yellow-500/20 text-yellow-300"
                                    : "bg-gray-500/20 text-gray-300"
                            }`}
                          >
                            {planInfo?.isExpired
                              ? "Expired"
                              : planInfo?.subscription?.status === "trial"
                                ? "Trial"
                                : planInfo?.subscription?.status || "Inactive"}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        {/* Plan Details */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="glass p-4 rounded-lg text-center">
                            <p className="text-2xl font-bold text-white">
                              {planInfo?.plan?.priceMonthly
                                ? `$${(planInfo.plan.priceMonthly / 100).toFixed(0)}`
                                : "Free"}
                            </p>
                            <p className="text-xs text-white/60">per month</p>
                          </div>
                          <div className="glass p-4 rounded-lg text-center">
                            <p className="text-2xl font-bold text-white">
                              {planInfo?.plan?.avatarLimit === null
                                ? "∞"
                                : planInfo?.plan?.avatarLimit || 1}
                            </p>
                            <p className="text-xs text-white/60">
                              Avatar
                              {planInfo?.plan?.avatarLimit !== 1 ? "s" : ""}
                            </p>
                          </div>
                          <div className="glass p-4 rounded-lg text-center">
                            <p className="text-2xl font-bold text-white">
                              {planInfo?.limits.videosRemaining === null
                                ? "∞"
                                : (planInfo?.limits.videosRemaining ?? 0)}
                            </p>
                            <p className="text-xs text-white/60">Videos Left</p>
                          </div>
                          <div className="glass p-4 rounded-lg text-center">
                            <p className="text-2xl font-bold text-white">
                              {planInfo?.limits.coursesRemaining === null
                                ? "∞"
                                : (planInfo?.limits.coursesRemaining ?? 0)}
                            </p>
                            <p className="text-xs text-white/60">
                              Courses Left
                            </p>
                          </div>
                        </div>

                        {/* Selected Avatar (for limited plans) */}
                        {planInfo?.plan?.avatarLimit === 1 &&
                          planInfo?.selectedAvatarId && (
                            <div className="glass p-4 rounded-lg">
                              <p className="text-sm text-white/60 mb-2">
                                Your Selected Avatar
                              </p>
                              <div className="flex items-center gap-3">
                                {avatarGifs[planInfo.selectedAvatarId] && (
                                  <img
                                    src={avatarGifs[planInfo.selectedAvatarId]}
                                    alt="Selected avatar"
                                    className="w-12 h-12 rounded-full object-cover"
                                  />
                                )}
                                <div>
                                  <p className="text-white font-medium">
                                    {avatars?.find(
                                      (a) => a.id === planInfo.selectedAvatarId,
                                    )?.name || planInfo.selectedAvatarId}
                                  </p>
                                  <p className="text-xs text-white/60">
                                    {planInfo.plan?.slug === "free"
                                      ? "Locked to this avatar during trial"
                                      : "Your dedicated avatar"}
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}

                        {/* Avatar Selection for Basic plan users without a selected avatar */}
                        {planInfo?.plan?.avatarLimit === 1 &&
                          !planInfo?.selectedAvatarId &&
                          planInfo?.subscription && (
                            <div className="glass border border-purple-500/30 p-4 rounded-lg">
                              <div className="flex items-center gap-3 mb-4">
                                <Users className="w-5 h-5 text-purple-400" />
                                <div>
                                  <p className="text-white font-medium">
                                    Choose Your Avatar
                                  </p>
                                  <p className="text-sm text-white/60">
                                    Select one avatar to use with your plan
                                  </p>
                                </div>
                              </div>
                              <div className="space-y-3">
                                <Select
                                  value={selectedAvatarId}
                                  onValueChange={setSelectedAvatarId}
                                >
                                  <SelectTrigger
                                    className="w-full bg-white/10 border-white/20 text-white"
                                    data-testid="select-basic-avatar"
                                  >
                                    <SelectValue placeholder="Choose an avatar..." />
                                  </SelectTrigger>
                                  <SelectContent className="bg-gray-900 border-white/20">
                                    {avatars
                                      ?.filter((a) => a.isActive)
                                      .map((avatar) => (
                                        <SelectItem
                                          key={avatar.id}
                                          value={avatar.id}
                                          className="text-white hover:bg-white/10 focus:bg-white/10 focus:text-white"
                                        >
                                          {avatar.name}
                                        </SelectItem>
                                      ))}
                                  </SelectContent>
                                </Select>
                                <Button
                                  className="w-full bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-700 hover:to-cyan-700"
                                  onClick={() =>
                                    selectedAvatarId &&
                                    selectAvatarMutation.mutate(
                                      selectedAvatarId,
                                    )
                                  }
                                  disabled={
                                    !selectedAvatarId ||
                                    selectAvatarMutation.isPending
                                  }
                                  data-testid="button-select-avatar"
                                >
                                  {selectAvatarMutation.isPending ? (
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                  ) : null}
                                  Select Avatar
                                </Button>
                              </div>
                            </div>
                          )}

                        {/* Expiry Warning */}
                        {planInfo?.isExpired && (
                          <div className="glass border border-red-500/30 p-4 rounded-lg">
                            <div className="flex items-center gap-3">
                              <AlertCircle className="w-5 h-5 text-red-400" />
                              <div>
                                <p className="text-white font-medium">
                                  Your plan has expired
                                </p>
                                <p className="text-sm text-white/60">
                                  Upgrade to continue using all features
                                </p>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Trial Timer */}
                        {planInfo?.subscription?.status === "trial" &&
                          planInfo?.subscription?.expiresAt &&
                          !planInfo.isExpired && (
                            <div className="glass border border-yellow-500/30 p-4 rounded-lg">
                              <div className="flex items-center gap-3">
                                <Clock className="w-5 h-5 text-yellow-400" />
                                <div>
                                  <p className="text-white font-medium">
                                    Trial ends{" "}
                                    {formatDistanceToNow(
                                      new Date(planInfo.subscription.expiresAt),
                                      { addSuffix: true },
                                    )}
                                  </p>
                                  <p className="text-sm text-white/60">
                                    Upgrade now to keep access to all features
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}
                      </CardContent>
                    </Card>

                    {/* Available Plans */}
                    <div>
                      <h3 className="text-lg font-semibold text-white mb-4">
                        Available Plans
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {allPlans?.map((plan) => {
                          const isCurrent = planInfo?.plan?.id === plan.id;
                          const isPro = plan.slug === "pro";

                          return (
                            <Card
                              key={plan.id}
                              className={`glass-strong border transition-all duration-300 flex flex-col h-full ${
                                isCurrent
                                  ? "border-purple-500/50 ring-2 ring-purple-500/20"
                                  : isPro
                                    ? "border-cyan-500/30 hover:border-cyan-500/50"
                                    : "border-white/10 hover:border-white/20"
                              }`}
                              data-testid={`plan-card-${plan.slug}`}
                            >
                              <CardHeader>
                                <div className="flex items-center justify-between">
                                  <CardTitle className="text-white">
                                    {plan.name}
                                  </CardTitle>
                                  {isCurrent && (
                                    <Badge className="bg-purple-500/20 text-purple-300">
                                      Current
                                    </Badge>
                                  )}
                                  {isPro && !isCurrent && (
                                    <Badge className="bg-cyan-500/20 text-cyan-300">
                                      Best Value
                                    </Badge>
                                  )}
                                </div>
                                <div className="mt-2">
                                  <span className="text-3xl font-bold text-white">
                                    ${(plan.priceMonthly / 100).toFixed(0)}
                                  </span>
                                  <span className="text-white/60">/month</span>
                                </div>
                              </CardHeader>
                              <CardContent className="space-y-4 flex-1 flex flex-col">
                                <ul className="space-y-2 text-sm">
                                  <li className="flex items-center gap-2 text-white/80">
                                    <Check className="w-4 h-4 text-green-400" />
                                    {plan.avatarLimit === null
                                      ? "All avatars unlocked"
                                      : `${plan.avatarLimit} avatar`}
                                  </li>
                                  <li className="flex items-center gap-2 text-white/80">
                                    <Check className="w-4 h-4 text-green-400" />
                                    {plan.videoLimit === null
                                      ? "Unlimited videos"
                                      : `${plan.videoLimit} videos/month`}
                                  </li>
                                  <li className="flex items-center gap-2 text-white/80">
                                    <Check className="w-4 h-4 text-green-400" />
                                    {plan.courseLimit === null
                                      ? "Unlimited courses"
                                      : `${plan.courseLimit} courses/month`}
                                  </li>
                                  <li className="flex items-center gap-2 text-white/80">
                                    <Check className="w-4 h-4 text-green-400" />
                                    {plan.chatSessionLimit === null
                                      ? "Unlimited chat"
                                      : `${plan.chatSessionLimit} chat sessions`}
                                  </li>
                                  {plan.durationHours && (
                                    <li className="flex items-center gap-2 text-yellow-400">
                                      <Clock className="w-4 h-4" />
                                      {plan.durationHours} hour trial
                                    </li>
                                  )}
                                </ul>

                                {!isCurrent && plan.slug !== "free" && (
                                  <div className="mt-auto">
                                    <Button
                                      className={`w-full ${isPro ? "bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-600 hover:to-purple-600" : ""}`}
                                      onClick={() =>
                                        upgradePlanMutation.mutate(plan.slug)
                                      }
                                      disabled={upgradePlanMutation.isPending}
                                      data-testid={`button-upgrade-${plan.slug}`}
                                    >
                                      {upgradePlanMutation.isPending ? (
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                      ) : null}
                                      {plan.priceMonthly >
                                      (planInfo?.plan?.priceMonthly || 0)
                                        ? "Upgrade"
                                        : "Switch"}{" "}
                                      to {plan.name}
                                    </Button>
                                  </div>
                                )}

                                {isCurrent && (
                                  <div className="mt-auto">
                                    <Badge className="w-full justify-center py-2 bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                      Your Current Plan
                                    </Badge>
                                  </div>
                                )}

                                {plan.slug === "free" &&
                                  !planInfo?.subscription && (
                                    <div className="space-y-2 mt-auto">
                                      <p className="text-xs text-white/60 text-center">
                                        Select an avatar to start your trial:
                                      </p>
                                      <Select
                                        value={selectedAvatarId}
                                        onValueChange={setSelectedAvatarId}
                                      >
                                        <SelectTrigger
                                          className="w-full bg-white/10 border-white/20 text-white"
                                          data-testid="select-trial-avatar"
                                        >
                                          <SelectValue placeholder="Choose an avatar..." />
                                        </SelectTrigger>
                                        <SelectContent className="bg-gray-900 border-white/20">
                                          {avatars
                                            ?.filter((a) => a.isActive)
                                            .map((avatar) => (
                                              <SelectItem
                                                key={avatar.id}
                                                value={avatar.id}
                                                className="text-white hover:bg-white/10 focus:bg-white/10 focus:text-white"
                                              >
                                                {avatar.name}
                                              </SelectItem>
                                            ))}
                                        </SelectContent>
                                      </Select>
                                      <Button
                                        className="w-full"
                                        onClick={() =>
                                          selectedAvatarId &&
                                          startTrialMutation.mutate(
                                            selectedAvatarId,
                                          )
                                        }
                                        disabled={
                                          !selectedAvatarId ||
                                          startTrialMutation.isPending
                                        }
                                        data-testid="button-start-trial"
                                      >
                                        {startTrialMutation.isPending ? (
                                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        ) : null}
                                        Start Free Trial
                                      </Button>
                                    </div>
                                  )}
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    </div>

                    {/* Usage This Month */}
                    {planInfo?.usage && (
                      <Card className="glass-strong border-white/10">
                        <CardHeader>
                          <CardTitle className="text-white flex items-center gap-2">
                            <Activity className="w-5 h-5 text-purple-400" />
                            Usage This Month
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="text-center">
                              <p className="text-2xl font-bold text-white">
                                {planInfo.usage.videosCreated}
                              </p>
                              <p className="text-xs text-white/60">
                                Videos Created
                              </p>
                            </div>
                            <div className="text-center">
                              <p className="text-2xl font-bold text-white">
                                {planInfo.usage.coursesCreated}
                              </p>
                              <p className="text-xs text-white/60">
                                Courses Created
                              </p>
                            </div>
                            <div className="text-center">
                              <p className="text-2xl font-bold text-white">
                                {planInfo.usage.chatSessionsUsed}
                              </p>
                              <p className="text-xs text-white/60">
                                Chat Sessions
                              </p>
                            </div>
                            <div className="text-center">
                              <p className="text-2xl font-bold text-white">
                                {planInfo.usage.moodEntriesLogged}
                              </p>
                              <p className="text-xs text-white/60">
                                Mood Entries
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Credits View */}
            {currentView === "credits" && (
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
                              <span
                                className={`px-2 py-1 rounded text-xs font-medium ${
                                  heygenStats.status === "ok"
                                    ? "bg-green-500/20 text-green-300"
                                    : heygenStats.status === "warning"
                                      ? "bg-yellow-500/20 text-yellow-300"
                                      : "bg-red-500/20 text-red-300"
                                }`}
                              >
                                {heygenStats.status === "ok"
                                  ? "Healthy"
                                  : heygenStats.status === "warning"
                                    ? "Warning"
                                    : "Critical"}
                              </span>
                            )}
                          </div>
                        </CardHeader>
                        <CardContent className="p-4 sm:p-6 pt-0 space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <p className="text-xs text-white/60 mb-1">Used</p>
                              <p className="text-xl font-semibold text-white">
                                {heygenStats?.totalUsed?.toLocaleString() || 0}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-white/60 mb-1">
                                Remaining
                              </p>
                              <p className="text-xl font-semibold text-cyan-400">
                                {heygenStats?.remaining?.toLocaleString() || 0}
                              </p>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <div className="flex justify-between text-xs text-white/60">
                              <span>Usage</span>
                              <span className="font-medium">
                                {heygenStats
                                  ? (
                                      (heygenStats.totalUsed /
                                        heygenStats.limit) *
                                      100
                                    ).toFixed(1)
                                  : 0}
                                %
                              </span>
                            </div>
                            <div className="w-full bg-white/10 rounded-full h-2">
                              <div
                                className="h-2 rounded-full bg-gradient-to-r from-purple-500 to-cyan-500 transition-all"
                                style={{
                                  width: `${heygenStats ? Math.min((heygenStats.totalUsed / heygenStats.limit) * 100, 100) : 0}%`,
                                }}
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
                              <p className="text-xl font-semibold text-white">
                                450,000
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-white/60 mb-1">
                                Remaining
                              </p>
                              <p className="text-xl font-semibold text-cyan-400">
                                550,000
                              </p>
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
                                style={{ width: "45%" }}
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
                              <p className="text-xl font-semibold text-white">
                                120,000
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-white/60 mb-1">
                                Remaining
                              </p>
                              <p className="text-xl font-semibold text-cyan-400">
                                380,000
                              </p>
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
                                style={{ width: "24%" }}
                              />
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Usage Chart */}
                    <Card className="glass-strong border-white/10">
                      <CardHeader className="p-4 sm:p-6 pb-3">
                        <CardTitle className="text-base font-semibold text-white">
                          Service Comparison
                        </CardTitle>
                        <CardDescription className="text-white/60">
                          Compare credit usage across all services
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="p-4 sm:p-6 pt-0">
                        <ResponsiveContainer width="100%" height={300}>
                          <BarChart
                            data={[
                              {
                                name: "HeyGen",
                                used: heygenStats?.totalUsed || 0,
                                remaining: heygenStats?.remaining || 0,
                              },
                              {
                                name: "Claude",
                                used: 450000,
                                remaining: 550000,
                              },
                              {
                                name: "ElevenLabs",
                                used: 120000,
                                remaining: 380000,
                              },
                            ]}
                            margin={{ left: 20, right: 20, top: 5, bottom: 5 }}
                          >
                            <CartesianGrid
                              strokeDasharray="3 3"
                              stroke="rgba(255,255,255,0.1)"
                            />
                            <XAxis
                              dataKey="name"
                              stroke="rgba(255,255,255,0.5)"
                              tick={{ fontSize: 12 }}
                            />
                            <YAxis
                              stroke="rgba(255,255,255,0.5)"
                              width={60}
                              tick={{ fontSize: 12 }}
                              tickFormatter={(value) => {
                                if (value >= 1000000)
                                  return `${(value / 1000000).toFixed(1)}M`;
                                if (value >= 1000)
                                  return `${(value / 1000).toFixed(0)}k`;
                                return value.toString();
                              }}
                            />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: "rgba(0,0,0,0.8)",
                                border: "1px solid rgba(255,255,255,0.2)",
                                borderRadius: "8px",
                                color: "white",
                              }}
                              formatter={(value: number) =>
                                value.toLocaleString()
                              }
                            />
                            <Legend />
                            <Bar
                              dataKey="used"
                              fill="#64748b"
                              name="Used Credits"
                            />
                            <Bar
                              dataKey="remaining"
                              fill="#06b6d4"
                              name="Remaining Credits"
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>

                    {/* Alert if credits low */}
                    {heygenStats && heygenStats.status !== "ok" && (
                      <Card className="glass-strong border-yellow-500/30 bg-yellow-500/5">
                        <CardHeader className="p-4 sm:p-6 pb-3">
                          <CardTitle className="text-base font-semibold flex items-center gap-2 text-yellow-300">
                            <AlertCircle className="w-4 h-4" />
                            Credit Alert
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 sm:p-6 pt-0">
                          <p className="text-sm text-yellow-200/80">
                            HeyGen credits are running low. Current status:{" "}
                            <strong className="font-semibold">
                              {heygenStats.status}
                            </strong>
                            . Only {heygenStats.remaining.toLocaleString()}{" "}
                            credits remaining out of{" "}
                            {heygenStats.limit.toLocaleString()}.
                          </p>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Course View - Show Course Videos */}
            {currentView === "course-view" &&
              selectedCourseId &&
              (() => {
                const selectedCourse = courses?.find(
                  (c) => c.id === selectedCourseId,
                );
                if (!selectedCourse) {
                  return (
                    <div className="text-center py-12">
                      <p className="text-white/60">Course not found</p>
                      <Button
                        onClick={() => setLocation(isEmbed ? "/embed/courses" : "/dashboard/courses")}
                        className="mt-4"
                      >
                        Back to Courses
                      </Button>
                    </div>
                  );
                }

                const lessonsWithVideos =
                  selectedCourse.lessons?.filter((l) => l.video?.videoUrl) ||
                  [];
                const pendingLessons =
                  selectedCourse.lessons?.filter((l) => !l.video?.videoUrl) ||
                  [];

                return (
                  <div className="space-y-6">
                    {/* Back button and course header */}
                    <div className="flex items-center justify-between">
                      <Button
                        variant="ghost"
                        onClick={() => setLocation(isEmbed ? "/embed/courses" : "/dashboard/courses")}
                        className="text-white/60 hover:text-white"
                        data-testid="button-back-to-courses"
                      >
                        <ChevronLeft className="w-4 h-4 mr-1" />
                        Back to Courses
                      </Button>
                      {!isEmbed && isAdmin && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-purple-500/30 text-purple-300 hover:bg-purple-500/20"
                          onClick={() =>
                            setLocation(
                              `/dashboard/courses/${selectedCourseId}/edit`,
                            )
                          }
                          data-testid="button-edit-course-from-view"
                        >
                          <Settings className="w-4 h-4 mr-2" />
                          Edit Course
                        </Button>
                      )}
                    </div>

                    {/* Course Info */}
                    <Card className="glass-strong border-purple-500/20">
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div>
                            <CardTitle className="text-white text-xl">
                              {selectedCourse.title}
                            </CardTitle>
                            <CardDescription className="text-white/60 mt-1">
                              {selectedCourse.description || "No description"}
                            </CardDescription>
                          </div>
                          <Badge
                            className={`${
                              selectedCourse.status === "completed"
                                ? "bg-green-500/20 text-green-300"
                                : selectedCourse.status === "generating"
                                  ? "bg-yellow-500/20 text-yellow-300"
                                  : "bg-gray-500/20 text-gray-300"
                            }`}
                          >
                            {selectedCourse.status}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 mt-3 text-sm text-white/60">
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4" />
                            <span>
                              {avatars?.find(
                                (a) => a.id === selectedCourse.avatarId,
                              )?.name || selectedCourse.avatarId}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Video className="w-4 h-4" />
                            <span>
                              {selectedCourse.totalLessons || 0} lessons
                            </span>
                          </div>
                          {selectedCourse.totalDuration > 0 && (
                            <div className="flex items-center gap-2">
                              <Clock className="w-4 h-4" />
                              <span>
                                {Math.floor(selectedCourse.totalDuration / 60)}:
                                {(selectedCourse.totalDuration % 60)
                                  .toString()
                                  .padStart(2, "0")}
                              </span>
                            </div>
                          )}
                        </div>
                      </CardHeader>
                    </Card>

                    {/* Videos Grid */}
                    {lessonsWithVideos.length === 0 &&
                    pendingLessons.length === 0 ? (
                      <Card className="glass-strong border-white/10">
                        <CardContent className="py-12 text-center">
                          <div className="w-16 h-16 rounded-full bg-gradient-primary/20 flex items-center justify-center mx-auto mb-4">
                            <Video className="w-8 h-8 text-purple-400" />
                          </div>
                          <p className="text-white/60">
                            No lessons in this course yet
                          </p>
                          {!isEmbed && isAdmin && (
                            <Button
                              onClick={() =>
                                setLocation(
                                  `/dashboard/courses/${selectedCourseId}/edit`,
                                )
                              }
                              className="mt-4"
                              data-testid="button-add-lessons"
                            >
                              <Plus className="w-4 h-4 mr-2" />
                              Add Lessons
                            </Button>
                          )}
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
                              <Card
                                key={lesson.id}
                                className="glass-strong border-white/10 overflow-hidden group"
                                data-testid={`card-lesson-video-${lesson.id}`}
                              >
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
                                      href={lesson.video?.videoUrl || "#"}
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
                                      {Math.floor(lesson.video.duration / 60)}:
                                      {(lesson.video.duration % 60)
                                        .toString()
                                        .padStart(2, "0")}
                                    </div>
                                  )}
                                </div>
                                <CardContent className="p-4">
                                  <h4 className="font-medium text-white truncate">
                                    {lesson.title}
                                  </h4>
                                  <div className="flex items-center justify-between mt-2">
                                    <Badge className="bg-green-500/20 text-green-300 text-xs">
                                      <CheckCircle className="w-3 h-3 mr-1" />
                                      Ready
                                    </Badge>
                                    <a
                                      href={lesson.video?.videoUrl || "#"}
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
                              <p className="text-white/60">
                                No videos generated yet
                              </p>
                              {isAdmin && (
                                <p className="text-white/40 text-sm mt-1">
                                  Go to Edit Course to generate videos
                                </p>
                              )}
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
                                <Card
                                  key={lesson.id}
                                  className="glass border-white/10 opacity-60"
                                  data-testid={`card-lesson-pending-${lesson.id}`}
                                >
                                  <div className="aspect-video bg-gradient-to-br from-gray-500/20 to-slate-500/20 flex items-center justify-center">
                                    <div className="text-center">
                                      <Loader2 className="w-8 h-8 text-white/40 mx-auto mb-2 animate-spin" />
                                      <p className="text-xs text-white/40">
                                        Not generated
                                      </p>
                                    </div>
                                  </div>
                                  <CardContent className="p-4">
                                    <h4 className="font-medium text-white/60 truncate">
                                      {lesson.title}
                                    </h4>
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
            {currentView === "course-edit" && (
              <div className="glass-strong border-white/10 rounded-lg overflow-hidden">
                <CourseBuilderPage
                  isEmbedded={true}
                  courseId={selectedCourseId}
                  onBack={() => setLocation(isEmbed ? "/embed/courses" : "/dashboard/courses")}
                />
              </div>
            )}

            {/* Mood Tracker View */}
            {currentView === "mood" && (
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
                        {
                          mood: "joyful" as MoodType,
                          emoji: "😊",
                          label: "Joyful",
                          color:
                            "from-yellow-500/20 to-orange-500/20 border-yellow-500/30",
                        },
                        {
                          mood: "calm" as MoodType,
                          emoji: "😌",
                          label: "Calm",
                          color:
                            "from-blue-500/20 to-cyan-500/20 border-blue-500/30",
                        },
                        {
                          mood: "energized" as MoodType,
                          emoji: "⚡",
                          label: "Energized",
                          color:
                            "from-purple-500/20 to-pink-500/20 border-purple-500/30",
                        },
                        {
                          mood: "neutral" as MoodType,
                          emoji: "😐",
                          label: "Neutral",
                          color:
                            "from-gray-500/20 to-slate-500/20 border-gray-500/30",
                        },
                        {
                          mood: "anxious" as MoodType,
                          emoji: "😰",
                          label: "Anxious",
                          color:
                            "from-amber-500/20 to-red-500/20 border-amber-500/30",
                        },
                        {
                          mood: "sad" as MoodType,
                          emoji: "😢",
                          label: "Sad",
                          color:
                            "from-indigo-500/20 to-blue-500/20 border-indigo-500/30",
                        },
                        {
                          mood: "stressed" as MoodType,
                          emoji: "😫",
                          label: "Stressed",
                          color:
                            "from-red-500/20 to-orange-500/20 border-red-500/30",
                        },
                      ].map(({ mood, emoji, label, color }) => (
                        <button
                          key={mood}
                          onClick={() => setSelectedMood(mood)}
                          className={`p-4 rounded-xl border transition-all duration-200 bg-gradient-to-br ${color} ${
                            selectedMood === mood
                              ? "ring-2 ring-purple-400 scale-105"
                              : "hover:scale-102 hover:brightness-110"
                          }`}
                          data-testid={`button-mood-${mood}`}
                        >
                          <div className="text-3xl mb-1">{emoji}</div>
                          <div className="text-xs text-white/80 font-medium">
                            {label}
                          </div>
                        </button>
                      ))}
                    </div>

                    {/* Intensity Slider */}
                    {selectedMood && (
                      <div className="space-y-3 animate-in fade-in duration-300">
                        <label className="text-sm font-medium text-white/80">
                          Intensity:{" "}
                          <span className="text-purple-400">
                            {moodIntensity}/5
                          </span>
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
                        <p className="text-xs text-white/40 text-right">
                          {moodNotes.length}/500
                        </p>
                      </div>
                    )}

                    {/* Submit Button */}
                    {selectedMood && (
                      <Button
                        onClick={() =>
                          moodMutation.mutate({
                            mood: selectedMood,
                            intensity: moodIntensity,
                            notes: moodNotes || undefined,
                          })
                        }
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
                            <p className="text-sm font-medium text-purple-300 mb-1">
                              Your wellness guide says:
                            </p>
                            <p className="text-white/90 text-sm leading-relaxed">
                              {lastMoodResponse.response}
                            </p>
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
                        <p className="text-white/60 text-sm">
                          No mood entries yet
                        </p>
                        <p className="text-white/40 text-xs mt-1">
                          Log your first mood to start tracking
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                        {moodEntries.slice(0, 10).map((entry) => {
                          const moodEmojis: Record<string, string> = {
                            joyful: "😊",
                            calm: "😌",
                            energized: "⚡",
                            neutral: "😐",
                            anxious: "😰",
                            sad: "😢",
                            stressed: "😫",
                          };
                          return (
                            <div
                              key={entry.id}
                              className="p-3 rounded-lg glass border border-white/10 hover:border-purple-500/30 transition-colors"
                              data-testid={`mood-entry-${entry.id}`}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-2xl">
                                    {moodEmojis[entry.mood] || "😐"}
                                  </span>
                                  <div>
                                    <span className="text-sm font-medium text-white capitalize">
                                      {entry.mood}
                                    </span>
                                    <span className="text-xs text-white/40 ml-2">
                                      Intensity: {entry.intensity}/5
                                    </span>
                                  </div>
                                </div>
                                <span className="text-xs text-white/40">
                                  {formatDistanceToNow(
                                    new Date(entry.createdAt),
                                    { addSuffix: true },
                                  )}
                                </span>
                              </div>
                              {entry.notes && (
                                <p className="text-xs text-white/60 mb-2 line-clamp-2">
                                  {entry.notes}
                                </p>
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
            {currentView === "settings" && (
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
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-sm font-medium text-white">
                          Profile Information
                        </h4>
                        {!isEditingProfile && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setIsEditingProfile(true)}
                            className="text-purple-400 hover:text-purple-300"
                            data-testid="button-edit-profile"
                          >
                            Edit
                          </Button>
                        )}
                      </div>
                      
                      {isEditingProfile ? (
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor="firstName" className="text-white/70">First Name</Label>
                            <Input
                              id="firstName"
                              value={editFirstName}
                              onChange={(e) => setEditFirstName(e.target.value)}
                              placeholder="Enter your first name"
                              className="bg-white/5 border-white/20 text-white placeholder:text-white/40"
                              data-testid="input-first-name"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="lastName" className="text-white/70">Last Name</Label>
                            <Input
                              id="lastName"
                              value={editLastName}
                              onChange={(e) => setEditLastName(e.target.value)}
                              placeholder="Enter your last name"
                              className="bg-white/5 border-white/20 text-white placeholder:text-white/40"
                              data-testid="input-last-name"
                            />
                          </div>
                          <div className="flex gap-2 pt-2">
                            <Button
                              onClick={handleSaveProfile}
                              disabled={updateProfileMutation.isPending}
                              className="bg-purple-600 hover:bg-purple-700"
                              data-testid="button-save-profile"
                            >
                              {updateProfileMutation.isPending ? (
                                <>
                                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                  Saving...
                                </>
                              ) : (
                                <>
                                  <Check className="w-4 h-4 mr-2" />
                                  Save
                                </>
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              onClick={handleCancelEdit}
                              disabled={updateProfileMutation.isPending}
                              data-testid="button-cancel-edit-profile"
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3 text-sm">
                          <div className="flex justify-between items-center py-2 border-b border-white/10">
                            <span className="text-white/60">Email</span>
                            <span className="text-white">
                              {user?.email || "Not available"}
                            </span>
                          </div>
                          <div className="flex justify-between items-center py-2 border-b border-white/10">
                            <span className="text-white/60">First Name</span>
                            <span className="text-white">
                              {user?.firstName || "Not set"}
                            </span>
                          </div>
                          <div className="flex justify-between items-center py-2">
                            <span className="text-white/60">Last Name</span>
                            <span className="text-white">
                              {user?.lastName || "Not set"}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Account actions hidden in embedded mode - auth handled by Webflow */}
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Delete Video Confirmation Dialog */}
      <Dialog open={!!videoToDelete} onOpenChange={(open) => !open && setVideoToDelete(null)}>
        <DialogContent className="glass-strong border-red-500/30">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-red-400" />
              Delete Video
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-white/70">
              Are you sure you want to delete this video?
            </p>
            {videoToDelete && (
              <div className="glass p-3 rounded-lg border border-white/10">
                <p className="font-medium text-white truncate">{videoToDelete.topic}</p>
                <p className="text-xs text-white/50 mt-1">
                  Status: {getStatusText(videoToDelete.status)}
                </p>
              </div>
            )}
            <p className="text-sm text-red-400/80">
              This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <Button
                variant="ghost"
                onClick={() => setVideoToDelete(null)}
                data-testid="button-cancel-delete"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => videoToDelete && deleteVideoMutation.mutate(videoToDelete.id)}
                disabled={deleteVideoMutation.isPending}
                data-testid="button-confirm-delete"
              >
                {deleteVideoMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
