import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Music,
  ExternalLink,
  RefreshCw,
  Clock,
  Disc3,
  X,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { GeneratedMedia } from "@shared/schema";

interface PlaylistDetailModalProps {
  item: GeneratedMedia | null;
  open: boolean;
  onClose: () => void;
  onRegenerate?: (item: GeneratedMedia) => void;
  isRegenerating?: boolean;
}

export function PlaylistDetailModal({
  item,
  open,
  onClose,
  onRegenerate,
  isRegenerating,
}: PlaylistDetailModalProps) {
  if (!item) return null;

  const metadata = item.metadataJson as any;
  const spec = metadata?.playlistSpec;
  const moodTags: string[] = metadata?.moodTags || [];
  const trackPreviews: any[] = metadata?.trackPreviews || [];
  const trackCount = metadata?.spotifyTrackCount || 0;
  const durationMinutes = metadata?.durationMinutes || 0;
  const fallbackGradient = metadata?.fallbackGradient;
  const isPreview = item.status === "preview_only";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg bg-[#0a0a0f] border-purple-500/20 text-white p-0 overflow-hidden max-h-[90vh] overflow-y-auto">
        {/* Hero image */}
        <div className="relative aspect-[4/3] w-full">
          {item.thumbnailUrl ? (
            <img
              src={item.thumbnailUrl}
              alt={item.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center"
              style={{
                background:
                  fallbackGradient ||
                  "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
              }}
            >
              <Music className="w-16 h-16 text-white/30" />
            </div>
          )}

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white/70 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Gradient overlay at bottom */}
          <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-[#0a0a0f] to-transparent" />
        </div>

        <div className="px-6 pb-6 -mt-8 relative z-10">
          {/* Title section */}
          <DialogHeader className="mb-4">
            <div className="flex items-start justify-between">
              <div>
                <DialogTitle className="text-2xl font-bold text-white mb-1">
                  {item.title}
                </DialogTitle>
                {item.subtitle && (
                  <p className="text-white/50 text-sm">{item.subtitle}</p>
                )}
              </div>
              <Badge
                variant="secondary"
                className="bg-[#1DB954]/90 text-white text-xs px-2 py-1 font-semibold shrink-0 ml-3"
              >
                Spotify
              </Badge>
            </div>
          </DialogHeader>

          {/* Meta row */}
          <div className="flex items-center gap-4 text-sm text-white/40 mb-4">
            {item.avatarName && (
              <span className="text-purple-400">{item.avatarName}</span>
            )}
            {durationMinutes > 0 && (
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {durationMinutes} min
              </span>
            )}
            {trackCount > 0 && (
              <span className="flex items-center gap-1">
                <Disc3 className="w-3.5 h-3.5" />
                {trackCount} tracks
              </span>
            )}
            <span>
              {formatDistanceToNow(new Date(item.createdAt), {
                addSuffix: true,
              })}
            </span>
          </div>

          {/* Mood tags */}
          {moodTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-5">
              {moodTags.map((tag) => (
                <span
                  key={tag}
                  className="text-xs px-2 py-1 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Avatar explanation */}
          {item.description && (
            <div className="bg-white/5 rounded-lg p-4 mb-5 border border-white/5">
              <p className="text-sm text-white/70 italic leading-relaxed">
                "{item.description}"
              </p>
              {item.avatarName && (
                <p className="text-xs text-white/30 mt-2">— {item.avatarName}</p>
              )}
            </div>
          )}

          {/* Energy curve */}
          {spec?.energyCurve && (
            <div className="mb-5">
              <h4 className="text-xs text-white/30 uppercase tracking-wider mb-1">
                Energy
              </h4>
              <p className="text-sm text-white/60">{spec.energyCurve}</p>
            </div>
          )}

          {/* Track preview list */}
          {trackPreviews.length > 0 && (
            <div className="mb-5">
              <h4 className="text-xs text-white/30 uppercase tracking-wider mb-2">
                Tracks
              </h4>
              <div className="space-y-1.5">
                {trackPreviews.map((track: any, i: number) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 py-1.5 px-2 rounded hover:bg-white/5 transition-colors"
                  >
                    <span className="text-xs text-white/20 w-5 text-right">
                      {i + 1}
                    </span>
                    {track.albumArt && (
                      <img
                        src={track.albumArt}
                        alt=""
                        className="w-8 h-8 rounded object-cover"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{track.name}</p>
                      <p className="text-xs text-white/40 truncate">
                        {track.artist}
                      </p>
                    </div>
                    <span className="text-xs text-white/20 shrink-0">
                      {Math.floor(track.duration_ms / 60000)}:
                      {String(
                        Math.floor((track.duration_ms % 60000) / 1000),
                      ).padStart(2, "0")}
                    </span>
                  </div>
                ))}
                {trackCount > trackPreviews.length && (
                  <p className="text-xs text-white/30 pl-8 pt-1">
                    +{trackCount - trackPreviews.length} more tracks
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Preview-only notice */}
          {isPreview && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 mb-5">
              <p className="text-sm text-amber-300">
                Connect Spotify to create this playlist for real.
              </p>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3">
            {item.externalUrl && (
              <Button
                className="flex-1 bg-[#1DB954] hover:bg-[#1ed760] text-white font-semibold"
                asChild
              >
                <a
                  href={item.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Open in Spotify
                </a>
              </Button>
            )}
            {onRegenerate && (
              <Button
                variant="outline"
                className="border-white/10 text-white/70 hover:text-white hover:bg-white/5"
                onClick={() => onRegenerate(item)}
                disabled={isRegenerating}
              >
                <RefreshCw
                  className={`w-4 h-4 mr-2 ${isRegenerating ? "animate-spin" : ""}`}
                />
                {isRegenerating ? "Regenerating..." : "Make Another Version"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
