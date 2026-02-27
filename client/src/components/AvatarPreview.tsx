import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { Video, Volume2, CheckCircle2, XCircle, ExternalLink } from "lucide-react";

interface Avatar {
  id: string;
  name: string;
  description: string;
  elevenlabsVoiceId: string;
  voiceRate: string;
  isActive: boolean;
}

export function AvatarPreview() {
  const { data: avatars, isLoading } = useQuery<Avatar[]>({
    queryKey: ['/api/admin/avatars'],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!avatars || avatars.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No avatars configured
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {avatars.map((avatar) => (
        <div 
          key={avatar.id}
          className="relative group"
          data-testid={`avatar-preview-${avatar.id}`}
        >
          {avatar.isActive && (
            <div className="absolute -inset-[2px] bg-gradient-to-r from-purple-500 via-cyan-500 to-purple-500 rounded-xl opacity-75 blur-sm group-hover:opacity-100 transition-opacity animate-gradient-xy" />
          )}
          <Card 
            className={`relative glass transition-all duration-300 group-hover:scale-[1.02] ${
              avatar.isActive 
                ? 'border-purple-500/30 shadow-xl shadow-purple-500/10 group-hover:shadow-2xl group-hover:shadow-purple-500/20' 
                : 'border-muted/30 opacity-60'
            }`}
          >
            <CardHeader className="pb-3 relative z-10">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <div className={`p-1.5 rounded-lg ${
                      avatar.isActive 
                        ? 'bg-gradient-to-br from-purple-500 to-cyan-500' 
                        : 'bg-muted'
                    }`}>
                      <Video className="w-4 h-4 text-white" />
                    </div>
                    <span className={avatar.isActive ? 'bg-gradient-to-r from-purple-500 via-cyan-500 to-purple-500 bg-clip-text text-transparent animate-gradient-text' : 'text-muted-foreground'}>
                      {avatar.name}
                    </span>
                  </CardTitle>
                  <CardDescription className="mt-2 text-sm line-clamp-2">
                    {avatar.description}
                  </CardDescription>
                </div>
                <Badge 
                  variant={avatar.isActive ? "default" : "secondary"}
                  className={`ml-2 ${avatar.isActive ? 'bg-gradient-to-r from-green-500 to-emerald-500 shadow-lg shadow-green-500/20' : ''}`}
                >
                  {avatar.isActive ? (
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                  ) : (
                    <XCircle className="w-3 h-3 mr-1" />
                  )}
                  {avatar.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 relative z-10">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Volume2 className="w-4 h-4" />
                    Voice Rate
                  </span>
                  <Badge variant="outline" className="font-mono glass-strong border-purple-500/20">
                    {avatar.voiceRate}x
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Voice ID</span>
                  <Badge variant="outline" className="font-mono text-xs max-w-[140px] truncate glass-strong border-cyan-500/20">
                    {avatar.elevenlabsVoiceId?.substring(0, 12)}...
                  </Badge>
                </div>
              </div>
              
              {avatar.isActive && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full glass border-purple-500/30 hover:bg-purple-500/20 hover:border-purple-500/50 hover:shadow-lg hover:shadow-purple-500/20 transition-all duration-300"
                  onClick={() => window.location.href = `/?avatar=${avatar.id}`}
                  data-testid={`button-chat-${avatar.id}`}
                >
                  <ExternalLink className="w-3 h-3 mr-2" />
                  Chat with {avatar.name.split(' ')[0]}
                </Button>
              )}
            </CardContent>
            
            {avatar.isActive && (
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-purple-500/10 via-cyan-500/10 to-purple-500/10 rounded-bl-full opacity-50 blur-xl animate-pulse-slow" />
            )}
          </Card>
        </div>
      ))}
    </div>
  );
}
