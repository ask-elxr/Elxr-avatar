import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";

export default function Account() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const { toast } = useToast();

  // Fetch user's documents
  const { data: userDocuments, isLoading: documentsLoading, error } = useQuery({
    queryKey: ["/api/documents/user"],
    enabled: isAuthenticated,
    retry: false,
  });

  // Handle authentication redirects
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({
        title: "Please sign in",
        description: "You need to be signed in to view your account. Redirecting...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 1000);
    }
  }, [isAuthenticated, isLoading, toast]);

  // Handle API errors
  useEffect(() => {
    if (error && isUnauthorizedError(error as Error)) {
      toast({
        title: "Session expired",
        description: "Your session has expired. Please sign in again.",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 1000);
    }
  }, [error, toast]);

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" data-testid="loading-spinner"></div>
      </div>
    );
  }

  // Show sign-in prompt if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen" data-testid="signin-prompt">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Account Access</CardTitle>
            <CardDescription>
              Please sign in to view your account and uploaded documents.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button asChild data-testid="button-signin">
              <a href="/api/login">Sign In</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const getInitials = (firstName?: string, lastName?: string) => {
    return `${firstName?.charAt(0) || ""}${lastName?.charAt(0) || ""}`.toUpperCase() || "U";
  };

  return (
    <div className="container mx-auto py-8 space-y-8" data-testid="account-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Your Account</h1>
          <p className="text-muted-foreground">Manage your profile and document uploads</p>
        </div>
        <Button variant="outline" asChild data-testid="button-signout">
          <a href="/api/logout">Sign Out</a>
        </Button>
      </div>

      {/* User Profile Card */}
      <Card data-testid="card-user-profile">
        <CardHeader>
          <CardTitle>Profile Information</CardTitle>
          <CardDescription>Your account details from your login provider</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-4">
            <Avatar className="w-16 h-16" data-testid="img-avatar">
              <AvatarImage src={(user as any)?.profileImageUrl || ""} alt="Profile" />
              <AvatarFallback>{getInitials((user as any)?.firstName, (user as any)?.lastName)}</AvatarFallback>
            </Avatar>
            <div className="space-y-1">
              <h3 className="text-lg font-semibold" data-testid="text-username">
                {(user as any)?.firstName || (user as any)?.lastName
                  ? `${(user as any).firstName || ""} ${(user as any).lastName || ""}`.trim()
                  : "User"}
              </h3>
              <p className="text-muted-foreground" data-testid="text-email">
                {(user as any)?.email || "No email provided"}
              </p>
              <Badge variant="secondary" data-testid="badge-status">
                Verified Account
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Document Statistics Card */}
      <Card data-testid="card-documents">
        <CardHeader>
          <CardTitle>Your Documents</CardTitle>
          <CardDescription>
            Documents you've uploaded to the knowledge base
          </CardDescription>
        </CardHeader>
        <CardContent>
          {documentsLoading ? (
            <div className="flex items-center space-x-2" data-testid="loading-documents">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
              <span>Loading your documents...</span>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center p-4 border rounded-lg" data-testid="stat-total-docs">
                  <div className="text-2xl font-bold text-blue-600">
                    {(userDocuments as any)?.stats?.totalVectorCount || 0}
                  </div>
                  <div className="text-sm text-muted-foreground">Total Document Chunks</div>
                </div>
                <div className="text-center p-4 border rounded-lg" data-testid="stat-namespaces">
                  <div className="text-2xl font-bold text-green-600">
                    {(userDocuments as any)?.stats?.namespaces ? Object.keys((userDocuments as any).stats.namespaces).length : 0}
                  </div>
                  <div className="text-sm text-muted-foreground">Categories</div>
                </div>
                <div className="text-center p-4 border rounded-lg" data-testid="stat-dimensions">
                  <div className="text-2xl font-bold text-purple-600">
                    {(userDocuments as any)?.stats?.dimension || 1536}
                  </div>
                  <div className="text-sm text-muted-foreground">Vector Dimensions</div>
                </div>
              </div>

              <Separator />

              <div className="text-center text-muted-foreground" data-testid="text-upload-info">
                <p>Your documents are processed and stored securely in the vector database.</p>
                <p className="mt-2">
                  <Button asChild className="mt-4" data-testid="button-go-admin">
                    <a href="/admin">Upload More Documents</a>
                  </Button>
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}