import { DocumentUpload } from "@/components/DocumentUpload";
import { AvatarManager } from "@/components/AvatarManager";
import { CostTracking } from "@/components/CostTracking";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Shield, Search, Database, Activity, FileText, Home, User, Users } from "lucide-react";
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
    <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-purple-500/10">
      <div className="container mx-auto p-6">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-primary via-purple-500 to-pink-500 rounded-lg">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-primary via-purple-500 to-pink-500 bg-clip-text text-transparent">
                Admin Dashboard
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/account">
                <Button variant="outline" className="border-primary/20 hover:bg-primary/10 hover:border-primary/40 transition-all" data-testid="button-account">
                  <User className="w-4 h-4 mr-2" />
                  My Account
                </Button>
              </Link>
              <Link href="/">
                <Button variant="outline" className="border-primary/20 hover:bg-primary/10 hover:border-primary/40 transition-all" data-testid="button-home">
                  <Home className="w-4 h-4 mr-2" />
                  Back to Avatar
                </Button>
              </Link>
              <div className="ml-4">
                <Button asChild variant="outline" className="border-primary/20 hover:bg-destructive/10 hover:border-destructive/40 transition-all" data-testid="button-signout">
                  <a href="/api/logout">Sign Out</a>
                </Button>
              </div>
            </div>
          </div>
          <p className="text-muted-foreground text-lg">
            Secure document management and AI knowledge base administration
          </p>
        </div>
        
        {/* Main Admin Content */}

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Avatar Management */}
          <Card className="lg:col-span-2 bg-gradient-to-br from-background via-background to-primary/5 border-primary/20 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <div className="p-1.5 bg-gradient-to-br from-primary to-purple-500 rounded-md">
                  <Users className="w-5 h-5 text-white" />
                </div>
                <span className="bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">
                  Avatar Management
                </span>
              </CardTitle>
              <CardDescription>
                Create and manage AI avatar personalities with unique configurations.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AvatarManager />
            </CardContent>
          </Card>

          {/* Cost Tracking */}
          <div className="lg:col-span-2">
            <CostTracking />
          </div>

          {/* Knowledge Base Management */}
          <Card className="lg:col-span-2 bg-gradient-to-br from-background via-background to-blue-500/5 border-blue-500/20 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <div className="p-1.5 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-md">
                  <FileText className="w-5 h-5 text-white" />
                </div>
                <span className="bg-gradient-to-r from-blue-500 to-cyan-500 bg-clip-text text-transparent">
                  Knowledge Base Management
                </span>
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
          <Card className="bg-gradient-to-br from-background via-background to-green-500/5 border-green-500/20 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <div className="p-1.5 bg-gradient-to-br from-green-500 to-emerald-500 rounded-md">
                  <Activity className="w-5 h-5 text-white" />
                </div>
                <span className="bg-gradient-to-r from-green-500 to-emerald-500 bg-clip-text text-transparent">
                  System Statistics
                </span>
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
          <Card className="bg-gradient-to-br from-background via-background to-orange-500/5 border-orange-500/20 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <div className="p-1.5 bg-gradient-to-br from-orange-500 to-amber-500 rounded-md">
                  <Search className="w-5 h-5 text-white" />
                </div>
                <span className="bg-gradient-to-r from-orange-500 to-amber-500 bg-clip-text text-transparent">
                  Knowledge Base Search
                </span>
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
        <Card className="mt-6 bg-gradient-to-br from-background via-background to-pink-500/5 border-pink-500/20 shadow-lg">
          <CardHeader>
            <CardTitle className="text-xl bg-gradient-to-r from-pink-500 to-rose-500 bg-clip-text text-transparent">
              Quick Actions
            </CardTitle>
            <CardDescription>
              Common administrative tasks and tools.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Button 
                variant="outline" 
                className="h-20 flex-col border-primary/20 hover:bg-primary/10 hover:border-primary/40 hover:scale-105 transition-all"
                onClick={() => window.open('/api/chat/enhanced', '_blank')}
                data-testid="button-test-claude"
              >
                <Activity className="w-6 h-6 mb-2 text-primary" />
                Test Claude API
              </Button>
              <Button 
                variant="outline" 
                className="h-20 flex-col border-green-500/20 hover:bg-green-500/10 hover:border-green-500/40 hover:scale-105 transition-all"
                onClick={() => fetchPineconeStats()}
                data-testid="button-test-pinecone"
              >
                <Database className="w-6 h-6 mb-2 text-green-500" />
                Check Vector DB
              </Button>
              <Link href="/">
                <Button 
                  variant="outline" 
                  className="h-20 flex-col w-full border-blue-500/20 hover:bg-blue-500/10 hover:border-blue-500/40 hover:scale-105 transition-all"
                  data-testid="button-avatar-chat"
                >
                  <FileText className="w-6 h-6 mb-2 text-blue-500" />
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