import { useAuth } from "@/hooks/useAuth";
import { useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Users, Database, BarChart, MessageSquare, FolderOpen } from "lucide-react";
import { Link } from "wouter";

export default function Dashboard() {
  const { isAuthenticated, isLoading, user } = useAuth();

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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b">
        <div className="container mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Dashboard</h1>
            <div className="flex items-center">
              <span className="text-xs sm:text-sm text-muted-foreground">Welcome, Test User</span>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 sm:px-6 py-4 sm:py-8">
        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-8 sm:mb-12">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer">
            <Link href="/" className="block">
              <CardHeader className="p-4 sm:p-6">
                <CardTitle className="flex items-center space-x-2 sm:space-x-3 text-base sm:text-lg">
                  <MessageSquare className="w-5 h-5 sm:w-6 sm:h-6 text-blue-500 flex-shrink-0" />
                  <span>Avatar Chat</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6 pt-0">
                <p className="text-sm sm:text-base text-muted-foreground">
                  Start a conversation with your AI avatar. Get answers from your knowledge base through natural conversation.
                </p>
                <Button className="mt-3 sm:mt-4 w-full sm:w-auto" size="sm">
                  Start Chatting
                </Button>
              </CardContent>
            </Link>
          </Card>

          <Card className="hover:shadow-lg transition-shadow cursor-pointer">
            <Link href="/knowledge-base" className="block">
              <CardHeader className="p-4 sm:p-6">
                <CardTitle className="flex items-center space-x-2 sm:space-x-3 text-base sm:text-lg">
                  <FolderOpen className="w-5 h-5 sm:w-6 sm:h-6 text-green-500 flex-shrink-0" />
                  <span>Knowledge Base</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6 pt-0">
                <p className="text-sm sm:text-base text-muted-foreground">
                  Manage your documents, upload new files, and organize your knowledge base for better AI responses.
                </p>
                <Button className="mt-3 sm:mt-4 w-full sm:w-auto" size="sm" variant="outline">
                  Manage Documents
                </Button>
              </CardContent>
            </Link>
          </Card>
        </div>

        {/* Features Overview */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          <Card>
            <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-3">
              <CardTitle className="flex items-center space-x-2 text-sm sm:text-base">
                <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500 flex-shrink-0" />
                <span>Document Processing</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6 pt-0">
              <p className="text-xs sm:text-sm text-muted-foreground">
                Upload and process PDFs, Word documents, and text files with automatic chunking and indexing.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-3">
              <CardTitle className="flex items-center space-x-2 text-sm sm:text-base">
                <Database className="w-4 h-4 sm:w-5 sm:h-5 text-green-500 flex-shrink-0" />
                <span>Vector Storage</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6 pt-0">
              <p className="text-xs sm:text-sm text-muted-foreground">
                Advanced vector database integration with embedding generation for semantic search capabilities.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-3">
              <CardTitle className="flex items-center space-x-2 text-sm sm:text-base">
                <Users className="w-4 h-4 sm:w-5 sm:h-5 text-purple-500 flex-shrink-0" />
                <span>User Management</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6 pt-0">
              <p className="text-xs sm:text-sm text-muted-foreground">
                Secure user authentication with document ownership tracking and access controls.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-3">
              <CardTitle className="flex items-center space-x-2 text-sm sm:text-base">
                <BarChart className="w-4 h-4 sm:w-5 sm:h-5 text-orange-500 flex-shrink-0" />
                <span>Analytics</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6 pt-0">
              <p className="text-xs sm:text-sm text-muted-foreground">
                Track document usage, storage metrics, and user activity with comprehensive reporting.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
