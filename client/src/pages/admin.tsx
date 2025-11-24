import { DocumentUpload } from "@/components/DocumentUpload";
import { AvatarManager } from "@/components/AvatarManager";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, Users, FileText, Settings, Home, LogOut, Video } from "lucide-react";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";

type AdminView = 'dashboard' | 'avatars' | 'knowledge' | 'settings';

export default function Admin() {
  const [currentView, setCurrentView] = useState<AdminView>('dashboard');
  const { toast } = useToast();
  const { user, isLoading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  const { data: avatarsData } = useQuery({
    queryKey: ['/api/admin/avatars'],
    enabled: isAuthenticated,
  });

  const { data: statsData } = useQuery({
    queryKey: ['/api/pinecone/stats'],
    enabled: isAuthenticated,
  });

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({
        title: "Please sign in",
        description: "You need to be signed in to access the admin panel.",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 1000);
    }
  }, [isAuthenticated, isLoading, toast]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" data-testid="loading-spinner"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen" data-testid="signin-prompt">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Admin Access Required</CardTitle>
            <CardDescription>
              Please sign in to access the admin dashboard.
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

  const totalAvatars = Array.isArray(avatarsData) ? avatarsData.filter((a: any) => a.isActive).length : 0;
  const totalDocuments = (statsData as any)?.success ? ((statsData as any).documents?.total || 0) : 0;
  const totalVectors = (statsData as any)?.success ? ((statsData as any).pinecone?.totalRecordCount || 0) : 0;

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-card/50 backdrop-blur-sm flex flex-col">
        <div className="p-6 border-b">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">
            Admin Panel
          </h1>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          <Button
            variant={currentView === 'dashboard' ? 'default' : 'ghost'}
            className="w-full justify-start"
            onClick={() => setCurrentView('dashboard')}
            data-testid="nav-dashboard"
          >
            <LayoutDashboard className="w-4 h-4 mr-3" />
            Dashboard
          </Button>
          
          <Button
            variant={currentView === 'avatars' ? 'default' : 'ghost'}
            className="w-full justify-start"
            onClick={() => setCurrentView('avatars')}
            data-testid="nav-avatars"
          >
            <Users className="w-4 h-4 mr-3" />
            Avatars
          </Button>
          
          <Button
            variant={currentView === 'knowledge' ? 'default' : 'ghost'}
            className="w-full justify-start"
            onClick={() => setCurrentView('knowledge')}
            data-testid="nav-knowledge"
          >
            <FileText className="w-4 h-4 mr-3" />
            Knowledge Base
          </Button>
          
          <Button
            variant={currentView === 'settings' ? 'default' : 'ghost'}
            className="w-full justify-start"
            onClick={() => setCurrentView('settings')}
            data-testid="nav-settings"
          >
            <Settings className="w-4 h-4 mr-3" />
            Settings
          </Button>
        </nav>

        <div className="p-4 border-t space-y-2">
          <Button
            variant="ghost"
            className="w-full justify-start"
            onClick={() => setLocation('/')}
            data-testid="nav-home"
          >
            <Home className="w-4 h-4 mr-3" />
            Back to Home
          </Button>
          
          <Button
            variant="ghost"
            className="w-full justify-start text-destructive hover:text-destructive"
            asChild
            data-testid="nav-logout"
          >
            <a href="/api/logout">
              <LogOut className="w-4 h-4 mr-3" />
              Logout
            </a>
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="p-8">
          {/* Header */}
          <div className="mb-8">
            <h2 className="text-3xl font-bold mb-2">
              Welcome, <span className="text-primary">{user?.firstName || user?.email || 'Admin'}</span>
            </h2>
            <p className="text-muted-foreground">
              {currentView === 'dashboard' && 'Track your progress, avatars & activity here'}
              {currentView === 'avatars' && 'Manage AI avatar personalities and configurations'}
              {currentView === 'knowledge' && 'Upload and manage knowledge base documents'}
              {currentView === 'settings' && 'Configure system settings and preferences'}
            </p>
          </div>

          {/* Dashboard View */}
          {currentView === 'dashboard' && (
            <>
              <div className="grid gap-6 md:grid-cols-3 mb-8">
                {/* Avatars Card */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Avatars</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        {Array.isArray(avatarsData) && avatarsData.slice(0, 3).map((avatar: any) => (
                          <div 
                            key={avatar.id} 
                            className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center text-white font-semibold text-sm"
                          >
                            {avatar.name.charAt(0)}
                          </div>
                        ))}
                        {totalAvatars > 3 && (
                          <div className="text-sm text-muted-foreground">
                            +{totalAvatars - 3}
                          </div>
                        )}
                      </div>
                      <Button 
                        className="w-full" 
                        variant="default"
                        onClick={() => setCurrentView('avatars')}
                        data-testid="button-view-avatars"
                      >
                        <Video className="w-4 h-4 mr-2" />
                        View Avatars
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Resources Card */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Resources</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Documents</span>
                        <span className="text-2xl font-bold">{totalDocuments}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Vectors</span>
                        <span className="text-2xl font-bold">{totalVectors}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Status Card */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Status</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-green-500"></div>
                        <span className="text-sm">All Systems Operational</span>
                      </div>
                      <Button 
                        variant="outline" 
                        className="w-full mt-4"
                        onClick={() => setCurrentView('settings')}
                      >
                        Settings
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Avatars Table */}
              <Card>
                <CardHeader>
                  <CardTitle>Active Avatars</CardTitle>
                  <CardDescription>Manage your AI avatar personalities</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {Array.isArray(avatarsData) && avatarsData.filter((a: any) => a.isActive).map((avatar: any) => (
                      <div 
                        key={avatar.id}
                        className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center text-white font-semibold">
                            {avatar.name.charAt(0)}
                          </div>
                          <div>
                            <h4 className="font-semibold">{avatar.name}</h4>
                            <p className="text-sm text-muted-foreground line-clamp-1">
                              {avatar.description}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-green-500"></div>
                            <span className="text-sm text-green-600 dark:text-green-400">Active</span>
                          </div>
                          <Link href={`/?avatar=${avatar.id}`}>
                            <Button size="sm" variant="outline" data-testid={`button-chat-${avatar.id}`}>
                              Chat
                            </Button>
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {/* Avatars View */}
          {currentView === 'avatars' && (
            <Card>
              <CardHeader>
                <CardTitle>Avatar Management</CardTitle>
                <CardDescription>
                  Create and manage AI avatar personalities with unique configurations
                </CardDescription>
              </CardHeader>
              <CardContent>
                <AvatarManager />
              </CardContent>
            </Card>
          )}

          {/* Knowledge Base View */}
          {currentView === 'knowledge' && (
            <Card>
              <CardHeader>
                <CardTitle>Knowledge Base</CardTitle>
                <CardDescription>
                  Upload documents to enhance AI avatar responses and capabilities
                </CardDescription>
              </CardHeader>
              <CardContent>
                <DocumentUpload />
              </CardContent>
            </Card>
          )}

          {/* Settings View */}
          {currentView === 'settings' && (
            <Card>
              <CardHeader>
                <CardTitle>Settings</CardTitle>
                <CardDescription>
                  Configure system preferences and account settings
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <h4 className="font-medium">Account</h4>
                      <p className="text-sm text-muted-foreground">
                        Signed in as {user?.email || 'User'}
                      </p>
                    </div>
                    <Link href="/account">
                      <Button variant="outline" size="sm">
                        Manage Account
                      </Button>
                    </Link>
                  </div>
                  
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <h4 className="font-medium">System Status</h4>
                      <p className="text-sm text-muted-foreground">
                        All services operational
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-green-500"></div>
                      <span className="text-sm text-green-600 dark:text-green-400">Active</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
