import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Plus, Video, Clock, User, MessageSquare, Play, Trash2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Course, ChatGeneratedVideo } from "@shared/schema";

export default function CoursesPage() {
  const { toast } = useToast();
  const [selectedVideo, setSelectedVideo] = useState<ChatGeneratedVideo | null>(null);
  const [deletingVideoId, setDeletingVideoId] = useState<string | null>(null);

  const { data: courses, isLoading: coursesLoading } = useQuery<Course[]>({
    queryKey: ["/api/courses"],
  });

  const { data: chatVideos, isLoading: chatVideosLoading } = useQuery<ChatGeneratedVideo[]>({
    queryKey: ["/api/courses/chat-videos"],
    refetchInterval: 10000,
  });

  const { data: avatars } = useQuery({
    queryKey: ["/api/avatars"],
  });

  const getAvatarName = (avatarId: string) => {
    const avatar = avatars?.find((a: any) => a.id === avatarId);
    return avatar?.name || avatarId;
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateString: string | Date) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-500/20 text-green-300 border-green-500/30';
      case 'generating': return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
      case 'pending': return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      case 'draft': return 'bg-gray-500/20 text-gray-300 border-gray-500/30';
      case 'failed': return 'bg-red-500/20 text-red-300 border-red-500/30';
      default: return 'bg-gray-500/20 text-gray-300 border-gray-500/30';
    }
  };

  const handleDeleteVideo = async (videoId: string) => {
    setDeletingVideoId(videoId);
    try {
      await apiRequest(`/api/courses/chat-videos/${videoId}`, {
        method: 'DELETE'
      });
      queryClient.invalidateQueries({ queryKey: ["/api/courses/chat-videos"] });
      toast({
        title: "Video deleted",
        description: "The video has been removed from your library.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete the video. Please try again.",
        variant: "destructive",
      });
    } finally {
      setDeletingVideoId(null);
    }
  };

  const handleDownloadVideo = (video: ChatGeneratedVideo) => {
    if (video.videoUrl) {
      window.open(video.videoUrl, '_blank');
    }
  };

  const isLoading = coursesLoading || chatVideosLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white">Loading videos...</div>
      </div>
    );
  }

  const completedChatVideos = chatVideos?.filter(v => v.status === 'completed') || [];
  const pendingChatVideos = chatVideos?.filter(v => v.status === 'pending' || v.status === 'generating') || [];

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-satoshi font-bold mb-2">Video Library</h1>
            <p className="text-gray-400 font-satoshi">
              Your AI-generated videos from courses and chat conversations
            </p>
          </div>
          <Link href="/course-builder">
            <Button className="bg-purple-600 hover:bg-purple-700 font-satoshi" data-testid="button-new-course">
              <Plus className="w-4 h-4 mr-2" />
              New Course
            </Button>
          </Link>
        </div>

        {/* Pending Videos Alert */}
        {pendingChatVideos.length > 0 && (
          <Card className="bg-yellow-900/20 border-yellow-600/30 mb-6">
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-yellow-500 rounded-full animate-pulse" />
                <span className="text-yellow-300 font-satoshi">
                  {pendingChatVideos.length} video{pendingChatVideos.length > 1 ? 's' : ''} generating...
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="chat-videos" className="w-full">
          <TabsList className="bg-gray-900 border border-gray-800 mb-6">
            <TabsTrigger 
              value="chat-videos" 
              className="data-[state=active]:bg-purple-600 font-satoshi"
              data-testid="tab-my-videos"
            >
              <MessageSquare className="w-4 h-4 mr-2" />
              My Videos ({completedChatVideos.length})
            </TabsTrigger>
            <TabsTrigger 
              value="courses" 
              className="data-[state=active]:bg-purple-600 font-satoshi"
              data-testid="tab-courses"
            >
              <Video className="w-4 h-4 mr-2" />
              Courses ({courses?.length || 0})
            </TabsTrigger>
          </TabsList>

          {/* Chat Generated Videos Tab */}
          <TabsContent value="chat-videos">
            {completedChatVideos.length === 0 ? (
              <Card className="bg-gray-900 border-gray-800">
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <MessageSquare className="w-16 h-16 text-gray-600 mb-4" />
                  <h3 className="text-xl font-satoshi mb-2">No videos yet</h3>
                  <p className="text-gray-400 font-satoshi mb-6 text-center max-w-md">
                    During your chat conversations with avatars, you can ask them to create videos. 
                    Just say something like "make me a video about..." and they'll generate it for you!
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {completedChatVideos.map((video) => (
                  <Card 
                    key={video.id} 
                    className="bg-gray-900 border-gray-800 hover:border-purple-600 transition-all cursor-pointer h-full group"
                    data-testid={`card-chat-video-${video.id}`}
                  >
                    {/* Thumbnail */}
                    <div 
                      className="relative aspect-video bg-gray-800 overflow-hidden rounded-t-lg"
                      onClick={() => setSelectedVideo(video)}
                    >
                      {video.thumbnailUrl ? (
                        <img 
                          src={video.thumbnailUrl} 
                          alt={video.topic}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Video className="w-12 h-12 text-gray-600" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Play className="w-12 h-12 text-white" />
                      </div>
                      {video.duration && (
                        <div className="absolute bottom-2 right-2 bg-black/80 px-2 py-1 rounded text-xs text-white">
                          {formatDuration(video.duration)}
                        </div>
                      )}
                    </div>

                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-white font-satoshi text-lg line-clamp-2">
                          {video.topic}
                        </CardTitle>
                        <Badge className={`${getStatusColor(video.status)} border font-satoshi text-xs shrink-0`}>
                          {video.status}
                        </Badge>
                      </div>
                    </CardHeader>

                    <CardContent>
                      <div className="space-y-2 text-sm text-gray-400 font-satoshi mb-4">
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4" />
                          <span>{getAvatarName(video.avatarId)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4" />
                          <span>{formatDate(video.createdAt)}</span>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="flex-1 bg-purple-600 hover:bg-purple-700"
                          onClick={() => setSelectedVideo(video)}
                          data-testid={`button-play-video-${video.id}`}
                        >
                          <Play className="w-4 h-4 mr-1" />
                          Play
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-gray-700 hover:bg-gray-800"
                          onClick={() => handleDownloadVideo(video)}
                          data-testid={`button-download-video-${video.id}`}
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-red-700 hover:bg-red-900/20 text-red-400"
                          onClick={() => handleDeleteVideo(video.id)}
                          disabled={deletingVideoId === video.id}
                          data-testid={`button-delete-video-${video.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Courses Tab */}
          <TabsContent value="courses">
            {!courses || courses.length === 0 ? (
              <Card className="bg-gray-900 border-gray-800">
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <Video className="w-16 h-16 text-gray-600 mb-4" />
                  <h3 className="text-xl font-satoshi mb-2">No courses yet</h3>
                  <p className="text-gray-400 font-satoshi mb-6 text-center max-w-md">
                    Start creating video courses with AI avatars. Build structured lessons and generate professional videos automatically.
                  </p>
                  <Link href="/course-builder">
                    <Button className="bg-purple-600 hover:bg-purple-700 font-satoshi">
                      <Plus className="w-4 h-4 mr-2" />
                      Create Your First Course
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {courses.map((course) => (
                  <Link key={course.id} href={`/course-builder/${course.id}`}>
                    <Card 
                      className="bg-gray-900 border-gray-800 hover:border-purple-600 transition-all cursor-pointer h-full"
                      data-testid={`card-course-${course.id}`}
                    >
                      <CardHeader>
                        <div className="flex items-start justify-between mb-3">
                          <CardTitle className="text-white font-satoshi line-clamp-2">
                            {course.title}
                          </CardTitle>
                          <Badge className={`${getStatusColor(course.status)} border font-satoshi text-xs`}>
                            {course.status}
                          </Badge>
                        </div>
                        <CardDescription className="text-gray-400 font-satoshi line-clamp-2">
                          {course.description || "No description"}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2 text-sm text-gray-400 font-satoshi">
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4" />
                            <span>{getAvatarName(course.avatarId)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Video className="w-4 h-4" />
                            <span>{course.totalLessons || 0} lessons</span>
                          </div>
                          {course.totalDuration > 0 && (
                            <div className="flex items-center gap-2">
                              <Clock className="w-4 h-4" />
                              <span>{formatDuration(course.totalDuration)}</span>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Video Player Dialog */}
      <Dialog open={!!selectedVideo} onOpenChange={() => setSelectedVideo(null)}>
        <DialogContent className="max-w-4xl bg-gray-900 border-gray-800">
          <DialogHeader>
            <DialogTitle className="text-white font-satoshi">
              {selectedVideo?.topic}
            </DialogTitle>
          </DialogHeader>
          {selectedVideo?.videoUrl && (
            <div className="aspect-video bg-black rounded-lg overflow-hidden">
              <video
                src={selectedVideo.videoUrl}
                controls
                autoPlay
                className="w-full h-full"
                data-testid="video-player"
              />
            </div>
          )}
          <div className="text-sm text-gray-400 font-satoshi">
            <p><strong>Avatar:</strong> {selectedVideo ? getAvatarName(selectedVideo.avatarId) : ''}</p>
            <p><strong>Created:</strong> {selectedVideo ? formatDate(selectedVideo.createdAt) : ''}</p>
            {selectedVideo?.duration && (
              <p><strong>Duration:</strong> {formatDuration(selectedVideo.duration)}</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
