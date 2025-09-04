import { DocumentUpload } from "@/components/DocumentUpload";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Shield, Search, Database, Activity, FileText, Home, User } from "lucide-react";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { isUnauthorizedError } from "@/lib/authUtils";

export default function Admin() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [pineconeStats, setPineconeStats] = useState<any>(null);
  const [isSearching, setIsSearching] = useState(false);
  const { toast } = useToast();
  const { user, isLoading, isAuthenticated } = useAuth();

  // Fetch Pinecone stats on component mount
  useEffect(() => {
    if (isAuthenticated) {
      fetchPineconeStats();
    }
  }, [isAuthenticated]);

  // Handle authentication redirects
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({
        title: "Please sign in",
        description: "You need to be signed in to access the admin panel. Redirecting...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 1000);
    }
  }, [isAuthenticated, isLoading, toast]);

  const fetchPineconeStats = async () => {
    try {
      const response = await fetch('/api/pinecone/stats');
      const data = await response.json();
      if (data.success) {
        setPineconeStats(data.stats);
      }
    } catch (error) {
      console.error('Error fetching Pinecone stats:', error);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      toast({
        title: "Search query required",
        description: "Please enter a search query.",
        variant: "destructive",
      });
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetch('/api/documents/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery, maxResults: 10 }),
      });
      
      const data = await response.json();
      if (data.success) {
        setSearchResults(data.results);
        toast({
          title: "Search completed",
          description: `Found ${data.results.length} relevant documents.`,
        });
      } else {
        toast({
          title: "Search failed",
          description: data.error || "Failed to search documents.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Search error:', error);
      if (isUnauthorizedError(error as Error)) {
        toast({
          title: "Session expired",
          description: "Your session has expired. Please sign in again.",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 1000);
        return;
      }
      toast({
        title: "Search failed",
        description: "An error occurred while searching.",
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  };

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
            <CardTitle>Admin Access Required</CardTitle>
            <CardDescription>
              Please sign in to access the admin dashboard and document upload features.
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

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Shield className="w-6 h-6 text-blue-600" />
              <h1 className="text-3xl font-bold">Admin Dashboard</h1>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/account">
                <Button variant="outline" data-testid="button-account">
                  <User className="w-4 h-4 mr-2" />
                  My Account
                </Button>
              </Link>
              <Link href="/">
                <Button variant="outline" data-testid="button-home">
                  <Home className="w-4 h-4 mr-2" />
                  Back to Avatar
                </Button>
              </Link>
              <div className="ml-4">
                <Button asChild variant="outline" data-testid="button-signout">
                  <a href="/api/logout">Sign Out</a>
                </Button>
              </div>
            </div>
          </div>
          <p className="text-muted-foreground">
            Secure document management and AI knowledge base administration
          </p>
        </div>
        
        {/* Main Admin Content */}

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Knowledge Base Management */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Knowledge Base Management
              </CardTitle>
              <CardDescription>
                Add information to enhance the AI avatar's responses and capabilities.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DocumentUpload />
            </CardContent>
          </Card>

          {/* System Statistics */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5" />
                System Statistics
              </CardTitle>
              <CardDescription>
                Monitor system performance and usage metrics.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {pineconeStats ? (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Vector Database</span>
                      <Badge variant="outline">
                        {pineconeStats.totalRecordCount || 0} documents
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Dimensions</span>
                      <Badge variant="outline">
                        {pineconeStats.dimension || 0}D
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Index Fullness</span>
                      <Badge variant="outline">
                        {((pineconeStats.indexFullness || 0) * 100).toFixed(2)}%
                      </Badge>
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    Loading statistics...
                  </div>
                )}
                <Button 
                  onClick={fetchPineconeStats} 
                  variant="outline" 
                  size="sm" 
                  className="w-full"
                  data-testid="button-refresh-stats"
                >
                  <Database className="w-4 h-4 mr-2" />
                  Refresh Stats
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Knowledge Base Search */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="w-5 h-5" />
                Knowledge Base Search
              </CardTitle>
              <CardDescription>
                Search through uploaded documents and content.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="search-query">Search Query</Label>
                  <Input
                    id="search-query"
                    placeholder="Enter your search query..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    data-testid="input-search-query"
                  />
                </div>
                <Button 
                  onClick={handleSearch} 
                  disabled={isSearching || !searchQuery.trim()}
                  className="w-full"
                  data-testid="button-search"
                >
                  {isSearching ? (
                    <>
                      <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Searching...
                    </>
                  ) : (
                    <>
                      <Search className="w-4 h-4 mr-2" />
                      Search Knowledge Base
                    </>
                  )}
                </Button>
                
                {searchResults.length > 0 && (
                  <div className="space-y-2 mt-4">
                    <h4 className="text-sm font-medium">Search Results ({searchResults.length})</h4>
                    <div className="max-h-60 overflow-y-auto space-y-2">
                      {searchResults.map((result, index) => (
                        <div key={index} className="p-3 border rounded-lg text-sm">
                          <div className="flex justify-between items-start mb-1">
                            <Badge variant="secondary" className="text-xs">
                              Score: {(result.score * 100).toFixed(1)}%
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {result.documentId}
                            </Badge>
                          </div>
                          <p className="text-muted-foreground text-xs leading-relaxed">
                            {result.text.substring(0, 200)}...
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>
              Common administrative tasks and tools.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Button 
                variant="outline" 
                className="h-20 flex-col"
                onClick={() => window.open('/api/chat/enhanced', '_blank')}
                data-testid="button-test-claude"
              >
                <Activity className="w-6 h-6 mb-2" />
                Test Claude API
              </Button>
              <Button 
                variant="outline" 
                className="h-20 flex-col"
                onClick={() => fetchPineconeStats()}
                data-testid="button-test-pinecone"
              >
                <Database className="w-6 h-6 mb-2" />
                Check Vector DB
              </Button>
              <Link href="/">
                <Button 
                  variant="outline" 
                  className="h-20 flex-col w-full"
                  data-testid="button-avatar-chat"
                >
                  <FileText className="w-6 h-6 mb-2" />
                  Avatar Chat
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}