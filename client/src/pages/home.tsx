import { useAuth } from "@/hooks/useAuth";
import { useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Users, Database, BarChart } from "lucide-react";

export default function Home() {
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    // Redirect authenticated users to knowledge base
    if (!isLoading && isAuthenticated) {
      window.location.href = "/knowledge-base";
    }
  }, [isAuthenticated, isLoading]);

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
      <div className="container mx-auto px-6 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-foreground mb-4">
            Knowledge Base Management
          </h1>
          <p className="text-xl text-muted-foreground mb-8">
            Professional document management and processing platform
          </p>
          <Button 
            size="lg" 
            onClick={() => window.location.href = "/api/login"}
            data-testid="button-login"
          >
            Get Started
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
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

        <div className="text-center">
          <h2 className="text-2xl font-semibold text-foreground mb-4">
            Ready to manage your knowledge base?
          </h2>
          <p className="text-muted-foreground mb-6">
            Sign in to access the document management dashboard
          </p>
          <Button 
            variant="outline" 
            size="lg"
            onClick={() => window.location.href = "/api/login"}
            data-testid="button-login-secondary"
          >
            Sign In
          </Button>
        </div>
      </div>
    </div>
  );
}
