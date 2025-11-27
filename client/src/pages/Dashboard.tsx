import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Users, Database, BarChart, MessageSquare, FolderOpen, Video, Settings, Shield } from "lucide-react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";

export default function Dashboard() {
  const { isAuthenticated, isLoading, user, isAdmin } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  const { data: chatVideos } = useQuery({
    queryKey: ['/api/courses/chat-videos'],
    enabled: isAuthenticated,
  });

  const completedVideos = (chatVideos as any[])?.filter((v: any) => v.status === 'completed') || [];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b">
        <div className="container mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Dashboard</h1>
            <div className="flex items-center gap-2">
              {isAdmin && (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-200">
                  <Shield className="w-3 h-3 mr-1" />
                  Admin
                </span>
              )}
              <span className="text-xs sm:text-sm text-muted-foreground">
                Welcome, {user?.firstName || user?.email || 'User'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 sm:px-6 py-4 sm:py-8">
        {/* Quick Actions */}
        <div className={`grid grid-cols-1 ${isAdmin ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-4 sm:gap-6 mb-8 sm:mb-12`}>
          {/* Avatar Chat - Available to all users */}
          <Card className="hover:shadow-lg transition-shadow cursor-pointer" data-testid="card-avatar-chat">
            <Link href="/" className="block">
              <CardHeader className="p-4 sm:p-6">
                <CardTitle className="flex items-center space-x-2 sm:space-x-3 text-base sm:text-lg">
                  <MessageSquare className="w-5 h-5 sm:w-6 sm:h-6 text-blue-500 flex-shrink-0" />
                  <span>Avatar Chat</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6 pt-0">
                <p className="text-sm sm:text-base text-muted-foreground">
                  Start a conversation with AI avatars. Get answers from the knowledge base through natural conversation.
                </p>
                <Button className="mt-3 sm:mt-4 w-full sm:w-auto" size="sm" data-testid="button-start-chat">
                  Start Chatting
                </Button>
              </CardContent>
            </Link>
          </Card>

          {/* My Videos - Available to all users */}
          <Card className="hover:shadow-lg transition-shadow cursor-pointer" data-testid="card-my-videos">
            <Link href="/my-videos" className="block">
              <CardHeader className="p-4 sm:p-6">
                <CardTitle className="flex items-center space-x-2 sm:space-x-3 text-base sm:text-lg">
                  <Video className="w-5 h-5 sm:w-6 sm:h-6 text-purple-500 flex-shrink-0" />
                  <span>My Videos</span>
                  {completedVideos.length > 0 && (
                    <span className="ml-auto text-xs bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-200 px-2 py-0.5 rounded-full">
                      {completedVideos.length}
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6 pt-0">
                <p className="text-sm sm:text-base text-muted-foreground">
                  View and download videos generated from your chat conversations with AI avatars.
                </p>
                <Button className="mt-3 sm:mt-4 w-full sm:w-auto" size="sm" variant="outline" data-testid="button-view-videos">
                  View Videos
                </Button>
              </CardContent>
            </Link>
          </Card>

          {/* Admin Panel - Only for admins */}
          {isAdmin && (
            <Card className="hover:shadow-lg transition-shadow cursor-pointer border-purple-200 dark:border-purple-800" data-testid="card-admin-panel">
              <Link href="/admin" className="block">
                <CardHeader className="p-4 sm:p-6">
                  <CardTitle className="flex items-center space-x-2 sm:space-x-3 text-base sm:text-lg">
                    <Settings className="w-5 h-5 sm:w-6 sm:h-6 text-purple-500 flex-shrink-0" />
                    <span>Admin Panel</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6 pt-0">
                  <p className="text-sm sm:text-base text-muted-foreground">
                    Manage avatars, upload documents, view analytics, and configure the knowledge base.
                  </p>
                  <Button className="mt-3 sm:mt-4 w-full sm:w-auto" size="sm" variant="outline" data-testid="button-admin-panel">
                    Open Admin
                  </Button>
                </CardContent>
              </Link>
            </Card>
          )}
        </div>

        {/* Features Overview */}
        <h2 className="text-lg font-semibold mb-4">Features</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          <Card>
            <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-3">
              <CardTitle className="flex items-center space-x-2 text-sm sm:text-base">
                <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500 flex-shrink-0" />
                <span>AI Conversations</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6 pt-0">
              <p className="text-xs sm:text-sm text-muted-foreground">
                Have natural voice and text conversations with personalized AI avatars powered by advanced AI.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-3">
              <CardTitle className="flex items-center space-x-2 text-sm sm:text-base">
                <Video className="w-4 h-4 sm:w-5 sm:h-5 text-purple-500 flex-shrink-0" />
                <span>Video Generation</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6 pt-0">
              <p className="text-xs sm:text-sm text-muted-foreground">
                Request custom videos during chat - just ask the avatar to make a video about any topic.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-3">
              <CardTitle className="flex items-center space-x-2 text-sm sm:text-base">
                <Database className="w-4 h-4 sm:w-5 sm:h-5 text-green-500 flex-shrink-0" />
                <span>Knowledge Base</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6 pt-0">
              <p className="text-xs sm:text-sm text-muted-foreground">
                Avatars have access to specialized knowledge bases for accurate, contextual responses.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-3">
              <CardTitle className="flex items-center space-x-2 text-sm sm:text-base">
                <Users className="w-4 h-4 sm:w-5 sm:h-5 text-orange-500 flex-shrink-0" />
                <span>Multiple Avatars</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6 pt-0">
              <p className="text-xs sm:text-sm text-muted-foreground">
                Choose from various AI avatars, each with unique expertise and personality.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Admin-only section */}
        {isAdmin && (
          <>
            <h2 className="text-lg font-semibold mt-8 mb-4 flex items-center gap-2">
              <Shield className="w-5 h-5 text-purple-500" />
              Admin Features
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              <Card>
                <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-3">
                  <CardTitle className="flex items-center space-x-2 text-sm sm:text-base">
                    <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500 flex-shrink-0" />
                    <span>Document Upload</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6 pt-0">
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Upload PDFs, Word documents, and text files to expand the knowledge base.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-3">
                  <CardTitle className="flex items-center space-x-2 text-sm sm:text-base">
                    <BarChart className="w-4 h-4 sm:w-5 sm:h-5 text-green-500 flex-shrink-0" />
                    <span>Analytics</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6 pt-0">
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Track API usage, costs, and user activity with comprehensive dashboards.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-3">
                  <CardTitle className="flex items-center space-x-2 text-sm sm:text-base">
                    <FolderOpen className="w-4 h-4 sm:w-5 sm:h-5 text-purple-500 flex-shrink-0" />
                    <span>Course Builder</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6 pt-0">
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Create video courses with AI-generated scripts and avatar presentations.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-3">
                  <CardTitle className="flex items-center space-x-2 text-sm sm:text-base">
                    <Settings className="w-4 h-4 sm:w-5 sm:h-5 text-orange-500 flex-shrink-0" />
                    <span>Avatar Settings</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6 pt-0">
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Configure avatar personalities, knowledge sources, and session limits.
                  </p>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
