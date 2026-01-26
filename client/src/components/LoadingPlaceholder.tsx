import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import type { AvatarProfile } from "@shared/schema";

interface LoadingPlaceholderProps extends React.HTMLAttributes<HTMLDivElement> {
  avatarId?: string;
  loadingAnimationUrl?: string | null;
}

const avatarGifs: Record<string, string> = {
  "mark-kohl": "/attached_assets/MArk-kohl-loop_1763964600000.gif",
  "mark": "/attached_assets/MArk-kohl-loop_1763964600000.gif",
  "willie-gault": "/attached_assets/Willie gault gif-low_1763964813725.gif",
  "willie": "/attached_assets/Willie gault gif-low_1763964813725.gif",
  "june": "/attached_assets/June-low_1764106896823.gif",
  "thad": "/attached_assets/Thad_1763963906199.gif",
  "nigel": "/attached_assets/Nigel-Loop-avatar_1763964600000.gif",
  "ann": "/attached_assets/Ann_1763966361095.gif",
  "kelsey": "/attached_assets/Kelsey_1764111279103.gif",
  "judy": "/attached_assets/Screen Recording 2025-07-14 at 14.35.37-low_1764106921758.gif",
  "dexter": "/attached_assets/DexterDoctor-ezgif.com-loop-count_1764111811631.gif",
  "shawn": "/attached_assets/Screen Recording 2025-07-14 at 14.41.54-low_1764106970821.gif",
};

export function LoadingPlaceholder({ 
  className = "", 
  avatarId = "mark-kohl",
  loadingAnimationUrl: propAnimationUrl,
  ...props 
}: LoadingPlaceholderProps) {
  const [mediaLoaded, setMediaLoaded] = useState(false);
  const [mediaError, setMediaError] = useState(false);

  // Reset states when avatar changes
  useEffect(() => {
    setMediaLoaded(false);
    setMediaError(false);
  }, [avatarId, propAnimationUrl]);

  const { data: avatars, isLoading: avatarsLoading } = useQuery<AvatarProfile[]>({
    queryKey: ['/api/avatars'],
    staleTime: 60000,
  });

  const avatar = avatars?.find(a => a.id === avatarId);
  const loadingAnimationUrl = propAnimationUrl ?? avatar?.loadingAnimationUrl;
  
  const gifSrc = avatarGifs[avatarId] || avatarGifs["mark-kohl"];
  
  const isVideo = loadingAnimationUrl && (
    loadingAnimationUrl.endsWith('.mp4') || 
    loadingAnimationUrl.endsWith('.webm') ||
    loadingAnimationUrl.includes('mp4') ||
    loadingAnimationUrl.includes('webm')
  );
  
  // Use video URL if available, otherwise fall back to gif
  // Encode URL to handle spaces and special characters in filenames
  const rawMediaSrc = loadingAnimationUrl || gifSrc;
  const mediaSrc = rawMediaSrc.startsWith('/attached_assets/') 
    ? `/attached_assets/${encodeURIComponent(rawMediaSrc.replace('/attached_assets/', ''))}`
    : rawMediaSrc;
  
  // Show loading spinner while fetching avatar data (if no propAnimationUrl provided)
  if (!propAnimationUrl && avatarsLoading) {
    return (
      <div className={`absolute inset-0 flex items-center justify-center bg-black ${className}`} {...props}>
        <Loader2 className="w-12 h-12 text-violet-400 animate-spin" />
      </div>
    );
  }
  
  if (isVideo) {
    return (
      <div className={`absolute inset-0 flex items-center justify-center bg-black ${className}`} {...props}>
        {(!mediaLoaded || mediaError) && (
          <div className="absolute inset-0 flex items-center justify-center bg-black z-10">
            <Loader2 className="w-12 h-12 text-violet-400 animate-spin" />
          </div>
        )}
        <video
          src={mediaSrc}
          autoPlay
          loop
          muted
          playsInline
          className={`w-full h-full object-cover transition-opacity duration-300 ${mediaLoaded && !mediaError ? 'opacity-100' : 'opacity-0'}`}
          onLoadedData={(e) => {
            setMediaLoaded(true);
          }}
          onError={() => setMediaError(true)}
          data-testid="avatar-video"
        />
        <p className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white/80 text-sm z-20">Starting session...</p>
      </div>
    );
  }
  
  return (
    <div className={`flex flex-col items-center justify-center bg-black ${className}`} {...props}>
      <div 
        className="rounded-full overflow-hidden relative"
        style={{
          width: '240px',
          height: '240px',
        }}
      >
        {(!mediaLoaded || mediaError) && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
            <Loader2 className="w-12 h-12 text-violet-400 animate-spin" />
          </div>
        )}
        <img
          src={mediaSrc}
          alt="Avatar"
          className={`w-full h-full object-cover transition-opacity duration-300 ${mediaLoaded && !mediaError ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setMediaLoaded(true)}
          onError={() => setMediaError(true)}
          data-testid="avatar-gif"
        />
      </div>
      <p className="text-white/80 mt-4 text-sm">Starting session...</p>
    </div>
  );
}
