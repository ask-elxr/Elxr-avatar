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
        <Card 
          key={avatar.id} 
          className={`relative overflow-hidden transition-all hover:scale-105 hover:shadow-xl ${
            avatar.isActive 
              ? 'bg-gradient-to-br from-background via-background to-primary/10 border-primary/30' 
              : 'bg-muted/50 border-muted opacity-70'
          }`}
          data-testid={`avatar-preview-${avatar.id}`}
        >
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Video className={`w-5 h-5 ${avatar.isActive ? 'text-primary' : 'text-muted-foreground'}`} />
                  <span className={avatar.isActive ? 'bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent' : ''}>
                    {avatar.name}
                  </span>
                </CardTitle>
                <CardDescription className="mt-2 text-sm line-clamp-2">
                  {avatar.description}
                </CardDescription>
              </div>
              <Badge 
                variant={avatar.isActive ? "default" : "secondary"}
                className={`ml-2 ${avatar.isActive ? 'bg-gradient-to-r from-green-500 to-emerald-500' : ''}`}
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
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-1">
                  <Volume2 className="w-4 h-4" />
                  Voice Rate
                </span>
                <Badge variant="outline" className="font-mono">
                  {avatar.voiceRate}x
                </Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Voice ID</span>
                <Badge variant="outline" className="font-mono text-xs max-w-[140px] truncate">
                  {avatar.elevenlabsVoiceId?.substring(0, 12)}...
                </Badge>
              </div>
            </div>
            
            {avatar.isActive && (
              <Button
                variant="outline"
                size="sm"
                className="w-full border-primary/30 hover:bg-primary/10 hover:border-primary/50 transition-all"
                onClick={() => window.location.href = `/?avatar=${avatar.id}`}
                data-testid={`button-chat-${avatar.id}`}
              >
                <ExternalLink className="w-3 h-3 mr-2" />
                Chat with {avatar.name.split(' ')[0]}
              </Button>
            )}
          </CardContent>
          
          {avatar.isActive && (
            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-primary/20 to-purple-500/20 rounded-bl-full opacity-50" />
          )}
        </Card>
      ))}
    </div>
  );
}
