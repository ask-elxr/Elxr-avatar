import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Video, Download, Clock, CheckCircle, Loader2, AlertCircle } from "lucide-react";
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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Sign In Required</CardTitle>
            <CardDescription>
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
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'generating':
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      case 'pending':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-500" />;
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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b">
        <div className="container mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center gap-4">
            <Link href="/dashboard">
              <Button variant="ghost" size="sm" data-testid="button-back">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
            </Link>
            <h1 className="text-xl sm:text-2xl font-semibold text-foreground">My Videos</h1>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 sm:px-6 py-6">
        {videosLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : !videos || videos.length === 0 ? (
          <Card className="max-w-lg mx-auto">
            <CardHeader className="text-center">
              <Video className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
              <CardTitle>No Videos Yet</CardTitle>
              <CardDescription>
                You haven't created any videos yet. Start a chat with an avatar and ask them to create a video about a topic!
              </CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center">
              <Button asChild data-testid="button-start-chat">
                <Link href="/">Start Chatting</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-8">
            {/* Pending/Generating Videos */}
            {pendingVideos.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                  In Progress ({pendingVideos.length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {pendingVideos.map((video) => (
                    <Card key={video.id} className="overflow-hidden" data-testid={`card-video-${video.id}`}>
                      <div className="aspect-video bg-muted flex items-center justify-center">
                        <Loader2 className="w-12 h-12 text-muted-foreground animate-spin" />
                      </div>
                      <CardContent className="p-4">
                        <h3 className="font-medium truncate mb-1">{video.topic}</h3>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          {getStatusIcon(video.status)}
                          <span>{getStatusText(video.status)}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
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
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  Completed ({completedVideos.length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {completedVideos.map((video) => (
                    <Card key={video.id} className="overflow-hidden" data-testid={`card-video-${video.id}`}>
                      {video.videoUrl ? (
                        <video
                          src={video.videoUrl}
                          className="aspect-video w-full object-cover"
                          controls
                          preload="metadata"
                        />
                      ) : (
                        <div className="aspect-video bg-muted flex items-center justify-center">
                          <Video className="w-12 h-12 text-muted-foreground" />
                        </div>
                      )}
                      <CardContent className="p-4">
                        <h3 className="font-medium truncate mb-1">{video.topic}</h3>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            {getStatusIcon(video.status)}
                            <span>{getStatusText(video.status)}</span>
                          </div>
                          {video.videoUrl && (
                            <Button
                              variant="ghost"
                              size="sm"
                              asChild
                              data-testid={`button-download-${video.id}`}
                            >
                              <a href={video.videoUrl} download target="_blank" rel="noopener noreferrer">
                                <Download className="w-4 h-4" />
                              </a>
                            </Button>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
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
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-red-500" />
                  Failed ({failedVideos.length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {failedVideos.map((video) => (
                    <Card key={video.id} className="overflow-hidden border-red-200 dark:border-red-800" data-testid={`card-video-${video.id}`}>
                      <div className="aspect-video bg-red-50 dark:bg-red-950 flex items-center justify-center">
                        <AlertCircle className="w-12 h-12 text-red-500" />
                      </div>
                      <CardContent className="p-4">
                        <h3 className="font-medium truncate mb-1">{video.topic}</h3>
                        <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                          {getStatusIcon(video.status)}
                          <span>{getStatusText(video.status)}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
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
