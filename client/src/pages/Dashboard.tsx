import { useAuth } from "@/hooks/useAuth";
import { useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Users, Database, BarChart, MessageSquare, FolderOpen } from "lucide-react";
import { Link } from "wouter";

export default function Dashboard() {
  const { isAuthenticated, isLoading, user } = useAuth();

  // Authentication check disabled for now
  // useEffect(() => {
  //   if (!isLoading && !isAuthenticated) {
  //     window.location.href = "/api/login";
  //   }
  // }, [isAuthenticated, isLoading]);

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
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-muted-foreground">Welcome, Test User</span>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-8">
        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer">
            <Link href="/" className="block">
              <CardHeader>
                <CardTitle className="flex items-center space-x-3">
                  <MessageSquare className="w-6 h-6 text-blue-500" />
                  <span>Avatar Chat</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Start a conversation with your AI avatar. Get answers from your knowledge base through natural conversation.
                </p>
                <Button className="mt-4" size="sm">
                  Start Chatting
                </Button>
              </CardContent>
            </Link>
          </Card>

          <Card className="hover:shadow-lg transition-shadow cursor-pointer">
            <Link href="/knowledge-base" className="block">
              <CardHeader>
                <CardTitle className="flex items-center space-x-3">
                  <FolderOpen className="w-6 h-6 text-green-500" />
                  <span>Knowledge Base</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Manage your documents, upload new files, and organize your knowledge base for better AI responses.
                </p>
                <Button className="mt-4" size="sm" variant="outline">
                  Manage Documents
                </Button>
              </CardContent>
            </Link>
          </Card>
        </div>

        {/* Features Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <FileText className="w-5 h-5 text-blue-500" />
                <span>Document Processing</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Upload and process PDFs, Word documents, and text files with automatic chunking and indexing.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Database className="w-5 h-5 text-green-500" />
                <span>Vector Storage</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Advanced vector database integration with embedding generation for semantic search capabilities.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Users className="w-5 h-5 text-purple-500" />
                <span>User Management</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Secure user authentication with document ownership tracking and access controls.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <BarChart className="w-5 h-5 text-orange-500" />
                <span>Analytics</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Track document usage, storage metrics, and user activity with comprehensive reporting.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}