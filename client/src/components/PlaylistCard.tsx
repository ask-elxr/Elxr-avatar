import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Music, ExternalLink, RefreshCw, Loader2, AlertCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { GeneratedMedia } from "@shared/schema";

interface PlaylistCardProps {
  item: GeneratedMedia;
  onOpenDetail: (item: GeneratedMedia) => void;
  onRegenerate?: (item: GeneratedMedia) => void;
  isRegenerating?: boolean;
}

export function PlaylistCard({
  item,
  onOpenDetail,
  onRegenerate,
  isRegenerating,
}: PlaylistCardProps) {
  const metadata = item.metadataJson as any;
  const moodTags: string[] = metadata?.moodTags || [];
  const fallbackGradient = metadata?.fallbackGradient;
  const isGenerating = item.status === "queued" || item.status === "generating";
  const isFailed = item.status === "failed";
  const isPreview = item.status === "preview_only";

  return (
    <Card
      className="overflow-hidden glass-strong border-purple-500/20 hover:border-purple-500/40 transition-all duration-300 group card-hover cursor-pointer"
      onClick={() => onOpenDetail(item)}
    >
      {/* Thumbnail / Image */}
      <div className="relative aspect-video">
        {isGenerating ? (
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-cyan-500/10 flex items-center justify-center">
            <div className="w-16 h-16 rounded-full bg-gradient-primary/30 flex items-center justify-center animate-pulse">
              <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
            </div>
          </div>
        ) : item.thumbnailUrl ? (
          <img
            src={item.thumbnailUrl}
            alt={item.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{
              background: fallbackGradient || "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            }}
          >
            <Music className="w-12 h-12 text-white/40" />
          </div>
        )}

        {/* Provider badge */}
        <div className="absolute top-2 right-2">
          <Badge
            variant="secondary"
            className="bg-[#1DB954]/90 text-white text-[10px] px-1.5 py-0.5 font-semibold"
          >
            Spotify
          </Badge>
        </div>

        {/* Status overlay for generating/failed */}
        {isGenerating && (
          <div className="absolute bottom-2 right-2 glass px-2 py-1 rounded text-xs text-purple-400 flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            Creating...
          </div>
        )}
        {isFailed && (
          <div className="absolute bottom-2 right-2 glass px-2 py-1 rounded text-xs text-red-400 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            Failed
          </div>
        )}
        {isPreview && (
          <div className="absolute bottom-2 left-2 glass px-2 py-1 rounded text-xs text-amber-400">
            Preview — Connect Spotify to create
          </div>
        )}
      </div>

      {/* Content */}
      <CardContent className="p-4">
        <h4 className="font-medium text-white truncate mb-1">{item.title}</h4>
        {item.subtitle && (
          <p className="text-sm text-white/50 truncate mb-2">{item.subtitle}</p>
        )}

        {/* Mood tags */}
        {moodTags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {moodTags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/5 text-white/40"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-white/40">
            {item.avatarName && <span>{item.avatarName}</span>}
            <span>
              {formatDistanceToNow(new Date(item.createdAt), {
                addSuffix: true,
              })}
            </span>
          </div>

          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            {item.externalUrl && (
              <Button
                variant="ghost"
                size="sm"
                className="text-[#1DB954] hover:text-[#1ed760] hover:bg-[#1DB954]/10 h-8 px-2"
                asChild
              >
                <a
                  href={item.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="w-3.5 h-3.5 mr-1" />
                  Open
                </a>
              </Button>
            )}
            {onRegenerate && !isGenerating && (
              <Button
                variant="ghost"
                size="sm"
                className="text-white/50 hover:text-white h-8 w-8 p-0"
                onClick={() => onRegenerate(item)}
                disabled={isRegenerating}
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${isRegenerating ? "animate-spin" : ""}`}
                />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
