import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Users, Database, BarChart, MessageSquare, FolderOpen, Video, Settings, Shield, Home, LogOut, Sparkles } from "lucide-react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";

export default function Dashboard() {
  const { isAuthenticated, isLoading, user, isAdmin } = useAuth();

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

  const { data: chatVideos } = useQuery({
    queryKey: ['/api/courses/chat-videos'],
    enabled: isAuthenticated,
  });

  const completedVideos = (chatVideos as any[])?.filter((v: any) => v.status === 'completed') || [];
  const pendingVideos = (chatVideos as any[])?.filter((v: any) => v.status === 'pending' || v.status === 'generating') || [];

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
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-purple-400 via-cyan-400 to-purple-400 bg-clip-text text-transparent">
                Dashboard
              </h1>
              <p className="text-sm text-white/60 mt-1">
                Welcome back, {user?.firstName || user?.email || 'User'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {isAdmin && (
                <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium glass-strong border-purple-500/30 text-purple-300 glow-primary">
                  <Shield className="w-3 h-3 mr-1.5" />
                  Admin
                </span>
              )}
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
      </div>

      <div className="relative container mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Quick Actions */}
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-purple-400" />
          Quick Actions
        </h2>
        <div className={`grid grid-cols-1 ${isAdmin ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-4 sm:gap-6 mb-8 sm:mb-12`}>
          {/* Avatar Chat - Available to all users */}
          <Card className="relative glass-strong border-purple-500/20 hover:border-purple-500/40 transition-all duration-300 group card-hover" data-testid="card-avatar-chat">
            <Link href="/" className="block">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-primary opacity-0 group-hover:opacity-100 transition-opacity" />
              <CardHeader className="p-4 sm:p-6">
                <CardTitle className="flex items-center space-x-3 text-base sm:text-lg text-white">
                  <div className="w-10 h-10 rounded-lg bg-gradient-primary flex items-center justify-center glow-primary group-hover:scale-110 transition-transform">
                    <MessageSquare className="w-5 h-5 text-white" />
                  </div>
                  <span>Avatar Chat</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6 pt-0">
                <p className="text-sm sm:text-base text-white/60 mb-4">
                  Start a conversation with AI avatars. Get answers from the knowledge base through natural conversation.
                </p>
                <Button className="w-full sm:w-auto" size="sm" data-testid="button-start-chat">
                  Start Chatting
                </Button>
              </CardContent>
            </Link>
          </Card>

          {/* My Videos - Available to all users */}
          <Card className="relative glass-strong border-cyan-500/20 hover:border-cyan-500/40 transition-all duration-300 group card-hover" data-testid="card-my-videos">
            <Link href="/my-videos" className="block">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-500 to-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              <CardHeader className="p-4 sm:p-6">
                <CardTitle className="flex items-center space-x-3 text-base sm:text-lg text-white">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 flex items-center justify-center glow-secondary group-hover:scale-110 transition-transform">
                    <Video className="w-5 h-5 text-white" />
                  </div>
                  <span>My Videos</span>
                  {completedVideos.length > 0 && (
                    <span className="ml-auto text-xs glass-strong border-cyan-500/30 text-cyan-300 px-2 py-0.5 rounded-full">
                      {completedVideos.length}
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6 pt-0">
                <p className="text-sm sm:text-base text-white/60 mb-4">
                  View and download videos generated from your chat conversations with AI avatars.
                </p>
                <div className="flex items-center gap-2">
                  <Button className="w-full sm:w-auto" size="sm" variant="secondary" data-testid="button-view-videos">
                    View Videos
                  </Button>
                  {pendingVideos.length > 0 && (
                    <span className="text-xs text-yellow-400 flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                      {pendingVideos.length} generating
                    </span>
                  )}
                </div>
              </CardContent>
            </Link>
          </Card>

          {/* Admin Panel - Only for admins */}
          {isAdmin && (
            <Card className="relative glass-strong border-purple-500/30 hover:border-purple-500/50 transition-all duration-300 group card-hover" data-testid="card-admin-panel">
              <Link href="/admin" className="block">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                <CardHeader className="p-4 sm:p-6">
                  <CardTitle className="flex items-center space-x-3 text-base sm:text-lg text-white">
                    <div className="w-10 h-10 rounded-lg bg-gradient-primary flex items-center justify-center glow-primary group-hover:scale-110 transition-transform">
                      <Settings className="w-5 h-5 text-white" />
                    </div>
                    <span>Admin Panel</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6 pt-0">
                  <p className="text-sm sm:text-base text-white/60 mb-4">
                    Manage avatars, upload documents, view analytics, and configure the knowledge base.
                  </p>
                  <Button className="w-full sm:w-auto" size="sm" variant="outline" data-testid="button-admin-panel">
                    Open Admin
                  </Button>
                </CardContent>
              </Link>
            </Card>
          )}
        </div>

        {/* Features Overview */}
        <h2 className="text-lg font-semibold text-white mb-4">Features</h2>
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
                Have natural voice and text conversations with personalized AI avatars powered by advanced AI.
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
                Request custom videos during chat - just ask the avatar to make a video about any topic.
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
                Avatars have access to specialized knowledge bases for accurate, contextual responses.
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
                Choose from various AI avatars, each with unique expertise and personality.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Admin-only section */}
        {isAdmin && (
          <>
            <h2 className="text-lg font-semibold text-white mt-8 mb-4 flex items-center gap-2">
              <Shield className="w-5 h-5 text-purple-400" />
              Admin Features
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              <Card className="glass border-purple-500/20 hover:border-purple-500/40 transition-all duration-300 group">
                <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-3">
                  <CardTitle className="flex items-center space-x-2 text-sm sm:text-base text-white">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center group-hover:bg-gradient-primary transition-all">
                      <FileText className="w-4 h-4 text-blue-400 group-hover:text-white transition-colors" />
                    </div>
                    <span>Document Upload</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6 pt-0">
                  <p className="text-xs sm:text-sm text-white/60">
                    Upload PDFs, Word documents, and text files to expand the knowledge base.
                  </p>
                </CardContent>
              </Card>

              <Card className="glass border-purple-500/20 hover:border-purple-500/40 transition-all duration-300 group">
                <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-3">
                  <CardTitle className="flex items-center space-x-2 text-sm sm:text-base text-white">
                    <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center group-hover:bg-gradient-primary transition-all">
                      <BarChart className="w-4 h-4 text-green-400 group-hover:text-white transition-colors" />
                    </div>
                    <span>Analytics</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6 pt-0">
                  <p className="text-xs sm:text-sm text-white/60">
                    Track API usage, costs, and user activity with comprehensive dashboards.
                  </p>
                </CardContent>
              </Card>

              <Card className="glass border-purple-500/20 hover:border-purple-500/40 transition-all duration-300 group">
                <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-3">
                  <CardTitle className="flex items-center space-x-2 text-sm sm:text-base text-white">
                    <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center group-hover:bg-gradient-primary transition-all">
                      <FolderOpen className="w-4 h-4 text-purple-400 group-hover:text-white transition-colors" />
                    </div>
                    <span>Course Builder</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6 pt-0">
                  <p className="text-xs sm:text-sm text-white/60">
                    Create video courses with AI-generated scripts and avatar presentations.
                  </p>
                </CardContent>
              </Card>

              <Card className="glass border-purple-500/20 hover:border-purple-500/40 transition-all duration-300 group">
                <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-3">
                  <CardTitle className="flex items-center space-x-2 text-sm sm:text-base text-white">
                    <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center group-hover:bg-gradient-primary transition-all">
                      <Settings className="w-4 h-4 text-orange-400 group-hover:text-white transition-colors" />
                    </div>
                    <span>Avatar Settings</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6 pt-0">
                  <p className="text-xs sm:text-sm text-white/60">
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
