import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  MessageSquare, Video, Settings, Sparkles, Download, Clock, CheckCircle,
  Loader2, AlertCircle, Play, Shield, Users, Database, Check, CreditCard,
  BookOpen, Plus, User, Trash2, DollarSign, TrendingUp, Activity, Heart,
  Smile, Frown, Meh, Zap, Sun, CloudRain, Lock, Crown
} from "lucide-react";
import { Link, useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect, useMemo } from "react";
import { formatDistanceToNow } from "date-fns";
import type {
  AvatarProfile, Course, ChatGeneratedVideo, Lesson, GeneratedVideo,
  MoodEntry, MoodType, SubscriptionPlan, UserSubscription, UsagePeriod
} from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, PieChart, Pie, Cell, LineChart, Line
} from "recharts";
import CourseBuilderPage from "../course-builder";
import { AvatarChat } from "@/components/avatar-chat";

interface LessonWithVideo extends Lesson {
  video: GeneratedVideo | null;
}

interface CourseWithLessons extends Course {
  lessons: LessonWithVideo[];
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

type EmbedView = 'dashboard' | 'chat' | 'videos' | 'courses' | 'mood' | 'plan' | 'credits' | 'settings';

interface EmbedPageProps {
  view: EmbedView;
  avatarId?: string;
  courseId?: string;
}

export default function EmbedPage({ view, avatarId, courseId }: EmbedPageProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedAvatar, setSelectedAvatar] = useState<AvatarProfile | null>(null);
  const [selectedVideoUrl, setSelectedVideoUrl] = useState<string | null>(null);
  const [selectedCourse, setSelectedCourse] = useState<CourseWithLessons | null>(null);
  const [showCourseBuilder, setShowCourseBuilder] = useState(false);
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);

  const { data: avatars = [] } = useQuery<AvatarProfile[]>({
    queryKey: ["/api/avatars"],
  });

  const { data: chatVideos = [] } = useQuery<ChatGeneratedVideo[]>({
    queryKey: ["/api/courses/chat-videos"],
    refetchInterval: 10000,
  });

  const { data: courses = [] } = useQuery<CourseWithLessons[]>({
    queryKey: ["/api/courses"],
    refetchInterval: (query) => {
      const data = query.state.data as CourseWithLessons[] | undefined;
      const hasGenerating = data?.some((course) =>
        course.lessons?.some((lesson) =>
          lesson.status === "generating" || lesson.video?.status === "generating"
        )
      );
      return hasGenerating ? 5000 : false;
    },
  });

  const { data: moodEntries = [] } = useQuery<MoodEntry[]>({
    queryKey: ["/api/mood"],
  });

  const { data: userPlanData } = useQuery<{
    plan: SubscriptionPlan;
    subscription: UserSubscription | null;
    usagePeriod: UsagePeriod | null;
  }>({
    queryKey: ["/api/subscription/user-plan"],
  });

  const { data: creditStats } = useQuery<{
    limit: number;
    totalUsed: number;
    remaining: number;
    last24h: number;
    last7d: number;
    status: string;
  }>({
    queryKey: ["/api/heygen/credits"],
  });

  const { data: subscriptionPlans = [] } = useQuery<SubscriptionPlan[]>({
    queryKey: ["/api/subscription/plans"],
  });

  const completedChatVideos = chatVideos.filter((v) => v.status === "completed");
  const generatingChatVideos = chatVideos.filter((v) => v.status === "generating" || v.status === "pending");

  const getMoodIcon = (mood: MoodType) => {
    const icons: Record<MoodType, JSX.Element> = {
      joyful: <Sun className="w-5 h-5 text-yellow-400" />,
      content: <Smile className="w-5 h-5 text-green-400" />,
      neutral: <Meh className="w-5 h-5 text-gray-400" />,
      anxious: <Zap className="w-5 h-5 text-orange-400" />,
      sad: <CloudRain className="w-5 h-5 text-blue-400" />,
      frustrated: <Frown className="w-5 h-5 text-red-400" />,
    };
    return icons[mood] || <Meh className="w-5 h-5" />;
  };

  const getMoodColor = (mood: MoodType) => {
    const colors: Record<MoodType, string> = {
      joyful: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
      content: "bg-green-500/20 text-green-300 border-green-500/30",
      neutral: "bg-gray-500/20 text-gray-300 border-gray-500/30",
      anxious: "bg-orange-500/20 text-orange-300 border-orange-500/30",
      sad: "bg-blue-500/20 text-blue-300 border-blue-500/30",
      frustrated: "bg-red-500/20 text-red-300 border-red-500/30",
    };
    return colors[mood] || "bg-gray-500/20 text-gray-300 border-gray-500/30";
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-green-500/20 text-green-300 border-green-500/30"><CheckCircle className="w-3 h-3 mr-1" />Ready</Badge>;
      case "generating":
        return <Badge className="bg-yellow-500/20 text-yellow-300 border-yellow-500/30"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Generating</Badge>;
      case "pending":
        return <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
      case "failed":
        return <Badge className="bg-red-500/20 text-red-300 border-red-500/30"><AlertCircle className="w-3 h-3 mr-1" />Failed</Badge>;
      default:
        return <Badge className="bg-gray-500/20 text-gray-300">{status}</Badge>;
    }
  };

  const renderContent = () => {
    switch (view) {
      case 'chat':
        if (avatarId) {
          const avatar = avatars.find(a => a.id === avatarId);
          if (avatar) {
            return (
              <div className="h-screen w-full">
                <AvatarChat
                  avatar={avatar}
                  onBack={() => window.history.back()}
                />
              </div>
            );
          }
        }
        return (
          <div className="p-4 sm:p-6 space-y-6">
            <h2 className="text-xl sm:text-2xl font-bold text-white mb-4">Select an Avatar to Chat</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {avatars.map((avatar) => (
                <Card
                  key={avatar.id}
                  className="glass border-white/10 hover:border-primary/50 transition-all cursor-pointer group"
                  onClick={() => window.location.href = `/embed/chat/${avatar.id}`}
                  data-testid={`avatar-card-${avatar.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 rounded-full overflow-hidden bg-gradient-to-br from-primary to-purple-500 flex-shrink-0">
                        {avatarGifs[avatar.id] ? (
                          <img src={avatarGifs[avatar.id]} alt={avatar.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-white text-xl font-bold">
                            {avatar.name.charAt(0)}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-white truncate">{avatar.name}</h3>
                        <p className="text-sm text-gray-400 line-clamp-2">{avatar.description}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        );

      case 'videos':
        return (
          <div className="p-4 sm:p-6 space-y-6">
            <h2 className="text-xl sm:text-2xl font-bold text-white mb-4">My Videos</h2>
            {completedChatVideos.length === 0 && generatingChatVideos.length === 0 ? (
              <Card className="glass border-white/10">
                <CardContent className="p-8 text-center">
                  <Video className="w-12 h-12 mx-auto mb-4 text-gray-500" />
                  <p className="text-gray-400">No videos yet. Create videos through chat!</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[...generatingChatVideos, ...completedChatVideos].map((video) => (
                  <Card key={video.id} className="glass border-white/10 overflow-hidden" data-testid={`video-card-${video.id}`}>
                    <div className="aspect-video bg-black/50 relative">
                      {video.status === "completed" && video.videoUrl ? (
                        <video
                          src={video.videoUrl}
                          className="w-full h-full object-cover"
                          poster={video.thumbnailUrl || undefined}
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          {video.status === "generating" ? (
                            <Loader2 className="w-8 h-8 animate-spin text-primary" />
                          ) : (
                            <Clock className="w-8 h-8 text-gray-500" />
                          )}
                        </div>
                      )}
                    </div>
                    <CardContent className="p-4">
                      <h3 className="font-semibold text-white truncate mb-2">{video.topic}</h3>
                      <div className="flex items-center justify-between">
                        {getStatusBadge(video.status)}
                        {video.status === "completed" && video.videoUrl && (
                          <Button size="sm" variant="ghost" onClick={() => window.open(video.videoUrl!, '_blank')}>
                            <Play className="w-4 h-4 mr-1" />
                            Play
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        );

      case 'courses':
        if (showCourseBuilder) {
          return (
            <div className="h-full">
              <CourseBuilderPage />
            </div>
          );
        }
        return (
          <div className="p-4 sm:p-6 space-y-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl sm:text-2xl font-bold text-white">My Courses</h2>
              <Button onClick={() => setShowCourseBuilder(true)} data-testid="button-new-course">
                <Plus className="w-4 h-4 mr-2" />
                New Course
              </Button>
            </div>
            {courses.length === 0 ? (
              <Card className="glass border-white/10">
                <CardContent className="p-8 text-center">
                  <BookOpen className="w-12 h-12 mx-auto mb-4 text-gray-500" />
                  <p className="text-gray-400">No courses yet. Create your first course!</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {courses.map((course) => (
                  <Card
                    key={course.id}
                    className="glass border-white/10 hover:border-primary/50 transition-all cursor-pointer"
                    onClick={() => setSelectedCourse(course)}
                    data-testid={`course-card-${course.id}`}
                  >
                    <CardContent className="p-4">
                      <h3 className="font-semibold text-white truncate mb-2">{course.title}</h3>
                      <p className="text-sm text-gray-400 line-clamp-2 mb-3">{course.description}</p>
                      <div className="flex items-center justify-between text-sm text-gray-500">
                        <span>{course.lessons?.length || 0} lessons</span>
                        <Badge variant="outline" className="text-xs">
                          {course.status}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        );

      case 'mood':
        return <EmbedMoodTracker />;

      case 'plan':
        return (
          <div className="p-4 sm:p-6 space-y-6">
            <h2 className="text-xl sm:text-2xl font-bold text-white mb-4">Subscription Plan</h2>
            <Card className="glass border-white/10">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Crown className="w-5 h-5 text-primary" />
                  Current Plan: {userPlanData?.plan?.name || 'Free Trial'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {subscriptionPlans.map((plan) => (
                    <Card
                      key={plan.id}
                      className={`border ${userPlanData?.plan?.id === plan.id ? 'border-primary' : 'border-white/10'}`}
                    >
                      <CardHeader>
                        <CardTitle>{plan.name}</CardTitle>
                        <CardDescription>{plan.description}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <p className="text-2xl font-bold text-white mb-4">
                          ${plan.price}/month
                        </p>
                        <ul className="text-sm text-gray-400 space-y-1">
                          <li>Max Avatars: {plan.maxAvatars}</li>
                          <li>Max Videos/month: {plan.maxVideosPerMonth}</li>
                          <li>Max Chat Sessions: {plan.maxChatSessions}</li>
                        </ul>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        );

      case 'credits':
        return (
          <div className="p-4 sm:p-6 space-y-6">
            <h2 className="text-xl sm:text-2xl font-bold text-white mb-4">Credits Usage</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="glass border-white/10">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-gray-400">Remaining Credits</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-white">{creditStats?.remaining || 0}</p>
                </CardContent>
              </Card>
              <Card className="glass border-white/10">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-gray-400">Used (Last 24h)</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-white">{creditStats?.last24h || 0}</p>
                </CardContent>
              </Card>
              <Card className="glass border-white/10">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-gray-400">Used (Last 7 days)</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-white">{creditStats?.last7d || 0}</p>
                </CardContent>
              </Card>
            </div>
          </div>
        );

      case 'settings':
        return (
          <div className="p-4 sm:p-6 space-y-6">
            <h2 className="text-xl sm:text-2xl font-bold text-white mb-4">Account Settings</h2>
            <Card className="glass border-white/10">
              <CardHeader>
                <CardTitle>Profile Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm text-gray-400">Email</label>
                  <p className="text-white">{user?.email || 'Not set'}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-400">Name</label>
                  <p className="text-white">{user?.firstName} {user?.lastName}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        );

      case 'dashboard':
      default:
        return (
          <div className="p-4 sm:p-6 space-y-6">
            <h2 className="text-xl sm:text-2xl font-bold text-white mb-4">
              Welcome, {user?.firstName || 'Guest'}
            </h2>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="glass border-white/10">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <Users className="w-8 h-8 text-primary" />
                    <div>
                      <p className="text-2xl font-bold text-white">{avatars.length}</p>
                      <p className="text-sm text-gray-400">Available Avatars</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="glass border-white/10">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <Video className="w-8 h-8 text-purple-400" />
                    <div>
                      <p className="text-2xl font-bold text-white">{completedChatVideos.length}</p>
                      <p className="text-sm text-gray-400">Videos Created</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="glass border-white/10">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <BookOpen className="w-8 h-8 text-green-400" />
                    <div>
                      <p className="text-2xl font-bold text-white">{courses.length}</p>
                      <p className="text-sm text-gray-400">Courses</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="glass border-white/10">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <CreditCard className="w-8 h-8 text-yellow-400" />
                    <div>
                      <p className="text-2xl font-bold text-white">{creditStats?.remaining || 0}</p>
                      <p className="text-sm text-gray-400">Credits Left</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="glass border-white/10">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquare className="w-5 h-5" />
                    Quick Chat
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-2">
                    {avatars.slice(0, 4).map((avatar) => (
                      <Button
                        key={avatar.id}
                        variant="outline"
                        className="h-auto py-3 justify-start"
                        onClick={() => window.location.href = `/embed/chat/${avatar.id}`}
                      >
                        <div className="w-8 h-8 rounded-full overflow-hidden mr-2 flex-shrink-0">
                          {avatarGifs[avatar.id] ? (
                            <img src={avatarGifs[avatar.id]} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-primary flex items-center justify-center text-white text-xs">
                              {avatar.name.charAt(0)}
                            </div>
                          )}
                        </div>
                        <span className="truncate">{avatar.name}</span>
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="glass border-white/10">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Video className="w-5 h-5" />
                    Recent Videos
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {completedChatVideos.length === 0 ? (
                    <p className="text-gray-400 text-sm">No videos yet</p>
                  ) : (
                    <div className="space-y-2">
                      {completedChatVideos.slice(0, 3).map((video) => (
                        <div
                          key={video.id}
                          className="flex items-center gap-3 p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
                          onClick={() => video.videoUrl && window.open(video.videoUrl, '_blank')}
                        >
                          <Play className="w-4 h-4 text-primary" />
                          <span className="text-white truncate flex-1">{video.topic}</span>
                        </div>
                      ))}
                    </div>
                  )}
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

function EmbedMoodTracker() {
  const { toast } = useToast();
  const [selectedMood, setSelectedMood] = useState<MoodType | null>(null);
  const [intensity, setIntensity] = useState(5);
  const [notes, setNotes] = useState("");

  const { data: moodEntries = [], refetch } = useQuery<MoodEntry[]>({
    queryKey: ["/api/mood"],
  });

  const { data: avatars = [] } = useQuery<AvatarProfile[]>({
    queryKey: ["/api/avatars"],
  });

  const moodMutation = useMutation({
    mutationFn: async (data: { mood: MoodType; intensity: number; notes?: string; avatarId?: string }) => {
      const response = await apiRequest("/api/mood", "POST", data);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Mood logged",
        description: data.aiResponse ? "Check the AI response below" : "Your mood has been recorded",
      });
      refetch();
      setSelectedMood(null);
      setIntensity(5);
      setNotes("");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to log mood",
        variant: "destructive",
      });
    },
  });

  const moodOptions: { type: MoodType; label: string; icon: JSX.Element; color: string }[] = [
    { type: "joyful", label: "Joyful", icon: <Sun className="w-6 h-6" />, color: "text-yellow-400 hover:bg-yellow-500/20" },
    { type: "content", label: "Content", icon: <Smile className="w-6 h-6" />, color: "text-green-400 hover:bg-green-500/20" },
    { type: "neutral", label: "Neutral", icon: <Meh className="w-6 h-6" />, color: "text-gray-400 hover:bg-gray-500/20" },
    { type: "anxious", label: "Anxious", icon: <Zap className="w-6 h-6" />, color: "text-orange-400 hover:bg-orange-500/20" },
    { type: "sad", label: "Sad", icon: <CloudRain className="w-6 h-6" />, color: "text-blue-400 hover:bg-blue-500/20" },
    { type: "frustrated", label: "Frustrated", icon: <Frown className="w-6 h-6" />, color: "text-red-400 hover:bg-red-500/20" },
  ];

  const getMoodIcon = (mood: MoodType) => {
    const option = moodOptions.find(o => o.type === mood);
    return option?.icon || <Meh className="w-5 h-5" />;
  };

  const getMoodColor = (mood: MoodType) => {
    const colors: Record<MoodType, string> = {
      joyful: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
      content: "bg-green-500/20 text-green-300 border-green-500/30",
      neutral: "bg-gray-500/20 text-gray-300 border-gray-500/30",
      anxious: "bg-orange-500/20 text-orange-300 border-orange-500/30",
      sad: "bg-blue-500/20 text-blue-300 border-blue-500/30",
      frustrated: "bg-red-500/20 text-red-300 border-red-500/30",
    };
    return colors[mood] || "bg-gray-500/20 text-gray-300 border-gray-500/30";
  };

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <h2 className="text-xl sm:text-2xl font-bold text-white mb-4">Mood Tracker</h2>
      
      <Card className="glass border-white/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Heart className="w-5 h-5 text-pink-400" />
            How are you feeling?
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {moodOptions.map((option) => (
              <Button
                key={option.type}
                variant={selectedMood === option.type ? "default" : "outline"}
                className={`flex flex-col h-auto py-3 ${option.color} ${selectedMood === option.type ? 'ring-2 ring-primary' : ''}`}
                onClick={() => setSelectedMood(option.type)}
              >
                {option.icon}
                <span className="text-xs mt-1">{option.label}</span>
              </Button>
            ))}
          </div>

          {selectedMood && (
            <>
              <div className="space-y-2">
                <label className="text-sm text-gray-400">Intensity: {intensity}/10</label>
                <Slider
                  value={[intensity]}
                  onValueChange={(v) => setIntensity(v[0])}
                  min={1}
                  max={10}
                  step={1}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm text-gray-400">Notes (optional)</label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="What's on your mind?"
                  className="bg-white/5 border-white/10"
                />
              </div>

              <Button
                className="w-full"
                onClick={() => moodMutation.mutate({
                  mood: selectedMood,
                  intensity,
                  notes: notes || undefined,
                  avatarId: avatars[0]?.id,
                })}
                disabled={moodMutation.isPending}
              >
                {moodMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Check className="w-4 h-4 mr-2" />
                )}
                Log Mood
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="glass border-white/10">
        <CardHeader>
          <CardTitle>Recent Entries</CardTitle>
        </CardHeader>
        <CardContent>
          {moodEntries.length === 0 ? (
            <p className="text-gray-400 text-sm">No mood entries yet</p>
          ) : (
            <div className="space-y-3">
              {moodEntries.slice(0, 5).map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-start gap-3 p-3 rounded-lg bg-white/5"
                >
                  <div className={`p-2 rounded-full ${getMoodColor(entry.mood)}`}>
                    {getMoodIcon(entry.mood)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-white capitalize">{entry.mood}</span>
                      <Badge variant="outline" className="text-xs">
                        {entry.intensity}/10
                      </Badge>
                    </div>
                    {entry.notes && (
                      <p className="text-sm text-gray-400">{entry.notes}</p>
                    )}
                    {entry.aiResponse && (
                      <p className="text-sm text-primary mt-2 italic">{entry.aiResponse}</p>
                    )}
                    <p className="text-xs text-gray-500 mt-1">
                      {formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
