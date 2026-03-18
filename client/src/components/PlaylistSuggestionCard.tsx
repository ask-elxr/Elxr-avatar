import { Button } from "@/components/ui/button";
import { Music, X, Loader2 } from "lucide-react";

interface PlaylistSuggestionCardProps {
  title: string;
  description: string;
  onAccept: () => void;
  onDismiss: () => void;
  isCreating?: boolean;
}

/**
 * Rich message card shown in the avatar chat when the avatar suggests a playlist.
 */
export function PlaylistSuggestionCard({
  title,
  description,
  onAccept,
  onDismiss,
  isCreating,
}: PlaylistSuggestionCardProps) {
  return (
    <div className="bg-gradient-to-br from-purple-500/10 to-cyan-500/10 border border-purple-500/20 rounded-xl p-4 max-w-sm">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center shrink-0">
          <Music className="w-5 h-5 text-purple-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-white mb-1">{title}</h4>
          <p className="text-xs text-white/50 leading-relaxed">{description}</p>
        </div>
      </div>

      <div className="flex gap-2 mt-3">
        <Button
          size="sm"
          className="flex-1 bg-purple-600 hover:bg-purple-500 text-white text-xs h-8"
          onClick={onAccept}
          disabled={isCreating}
        >
          {isCreating ? (
            <>
              <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
              Creating...
            </>
          ) : (
            <>
              <Music className="w-3 h-3 mr-1.5" />
              Create Playlist
            </>
          )}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-white/40 hover:text-white/70 text-xs h-8 px-2"
          onClick={onDismiss}
          disabled={isCreating}
        >
          Maybe Later
        </Button>
      </div>
    </div>
  );
}

interface PlaylistCreatedCardProps {
  title: string;
  thumbnailUrl?: string | null;
  externalUrl?: string | null;
  onViewInMyVideos: () => void;
}

/**
 * Card shown in chat after a playlist is successfully created.
 */
export function PlaylistCreatedCard({
  title,
  thumbnailUrl,
  externalUrl,
  onViewInMyVideos,
}: PlaylistCreatedCardProps) {
  return (
    <div className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 border border-green-500/20 rounded-xl p-4 max-w-sm">
      <div className="flex items-start gap-3">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={title}
            className="w-12 h-12 rounded-lg object-cover shrink-0"
          />
        ) : (
          <div className="w-12 h-12 rounded-lg bg-[#1DB954]/20 flex items-center justify-center shrink-0">
            <Music className="w-6 h-6 text-[#1DB954]" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs text-green-400 mb-0.5">Playlist created</p>
          <h4 className="text-sm font-semibold text-white truncate">{title}</h4>
        </div>
      </div>

      <div className="flex gap-2 mt-3">
        {externalUrl && (
          <Button
            size="sm"
            className="flex-1 bg-[#1DB954] hover:bg-[#1ed760] text-white text-xs h-8"
            asChild
          >
            <a href={externalUrl} target="_blank" rel="noopener noreferrer">
              Open in Spotify
            </a>
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          className="border-white/10 text-white/60 hover:text-white text-xs h-8"
          onClick={onViewInMyVideos}
        >
          View in My Videos
        </Button>
      </div>
    </div>
  );
}
