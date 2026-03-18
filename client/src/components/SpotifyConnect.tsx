import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface SpotifyStatus {
  connected: boolean;
  configured: boolean;
}

/**
 * Spotify connection widget — shows connect/disconnect buttons.
 * Can be placed in settings or as a standalone prompt.
 */
export function SpotifyConnect({ compact = false }: { compact?: boolean }) {
  const { toast } = useToast();

  const { data: status, isLoading } = useQuery<SpotifyStatus>({
    queryKey: ["/api/spotify/status"],
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("/api/spotify/connect", "GET");
      const data = await res.json();
      // Redirect to Spotify OAuth
      window.location.href = data.url;
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Connection failed",
        description: error.message || "Could not connect to Spotify",
      });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("/api/spotify/disconnect", "POST");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/spotify/status"] });
      toast({
        title: "Spotify disconnected",
        description: "Your Spotify account has been unlinked.",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-white/40 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" />
        Checking Spotify...
      </div>
    );
  }

  if (!status?.configured) {
    return null; // Spotify not configured on server
  }

  if (status.connected) {
    return (
      <div className="flex items-center gap-3">
        <Badge className="bg-[#1DB954]/20 text-[#1DB954] border-[#1DB954]/30 text-xs">
          Spotify Connected
        </Badge>
        {!compact && (
          <Button
            variant="ghost"
            size="sm"
            className="text-white/40 hover:text-white/60 text-xs h-7"
            onClick={() => disconnectMutation.mutate()}
            disabled={disconnectMutation.isPending}
          >
            Disconnect
          </Button>
        )}
      </div>
    );
  }

  return (
    <Button
      size={compact ? "sm" : "default"}
      className="bg-[#1DB954] hover:bg-[#1ed760] text-white font-semibold"
      onClick={() => connectMutation.mutate()}
      disabled={connectMutation.isPending}
    >
      {connectMutation.isPending ? (
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
      ) : (
        <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
        </svg>
      )}
      Connect Spotify
    </Button>
  );
}
