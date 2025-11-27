import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Video, Download, Clock, CheckCircle, Loader2, AlertCircle, Sparkles, Home, LogOut, Play } from "lucide-react";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";

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

export default function MyVideos() {
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();

  const { data: videos, isLoading: videosLoading } = useQuery<ChatVideo[]>({
    queryKey: ['/api/courses/chat-videos'],
    enabled: isAuthenticated,
  });

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background dot-pattern flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-gradient-primary glow-primary flex items-center justify-center mx-auto mb-4 animate-pulse">
            <Video className="w-8 h-8 text-white" />
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
              <Video className="w-8 h-8 text-white" />
            </div>
            <CardTitle className="text-white">Sign In Required</CardTitle>
            <CardDescription className="text-white/60">
              Please sign in to view your videos.
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

  const completedVideos = videos?.filter(v => v.status === 'completed') || [];
  const pendingVideos = videos?.filter(v => v.status === 'pending' || v.status === 'generating') || [];
  const failedVideos = videos?.filter(v => v.status === 'failed') || [];

  return (
    <div className="min-h-screen bg-background dot-pattern">
      {/* Floating orbs for ambiance */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-purple-500/20 rounded-full blur-[100px] animate-float" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-cyan-500/20 rounded-full blur-[120px] animate-float-delayed" />
      </div>

      {/* Header */}
      <div className="relative glass-strong border-b border-white/10">
        <div className="container mx-auto px-4 sm:px-6 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-4">
              <Link href="/dashboard">
                <Button variant="ghost" size="sm" className="gap-2" data-testid="button-back">
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-cyan-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">
                  My Videos
                </h1>
                <p className="text-sm text-white/60 mt-0.5">
                  Videos generated from your chat conversations
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" className="gap-2" asChild>
                <Link href="/">
                  <Home className="w-4 h-4" />
                  <span className="hidden sm:inline">Home</span>
                </Link>
              </Button>
              <Button variant="ghost" size="sm" className="gap-2 text-red-400 hover:text-red-300" asChild>
                <a href="/api/logout">
                  <LogOut className="w-4 h-4" />
                  <span className="hidden sm:inline">Logout</span>
                </a>
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="relative container mx-auto px-4 sm:px-6 py-6">
        {videosLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-gradient-primary glow-primary flex items-center justify-center mx-auto mb-4 animate-pulse">
                <Loader2 className="w-6 h-6 text-white animate-spin" />
              </div>
              <p className="text-white/60">Loading your videos...</p>
            </div>
          </div>
        ) : !videos || videos.length === 0 ? (
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
              <Button asChild data-testid="button-start-chat">
                <Link href="/">
                  <Sparkles className="w-4 h-4 mr-2" />
                  Start Chatting
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-8">
            {/* Pending/Generating Videos */}
            {pendingVideos.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-cyan-500/20 flex items-center justify-center">
                    <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
                  </div>
                  In Progress ({pendingVideos.length})
                </h2>
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
                        <h3 className="font-medium text-white truncate mb-2">{video.topic}</h3>
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
                <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center">
                    <CheckCircle className="w-4 h-4 text-green-400" />
                  </div>
                  Completed ({completedVideos.length})
                </h2>
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
                        <h3 className="font-medium text-white truncate mb-2">{video.topic}</h3>
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
                <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-red-500/20 flex items-center justify-center">
                    <AlertCircle className="w-4 h-4 text-red-400" />
                  </div>
                  Failed ({failedVideos.length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {failedVideos.map((video) => (
                    <Card key={video.id} className="overflow-hidden glass-strong border-red-500/20" data-testid={`card-video-${video.id}`}>
                      <div className="aspect-video bg-gradient-to-br from-red-500/10 to-rose-500/10 flex items-center justify-center">
                        <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center">
                          <AlertCircle className="w-8 h-8 text-red-400" />
                        </div>
                      </div>
                      <CardContent className="p-4">
                        <h3 className="font-medium text-white truncate mb-2">{video.topic}</h3>
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
      </div>
    </div>
  );
}
