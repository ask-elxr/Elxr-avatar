import { useState, useEffect, useRef, useCallback } from "react";
import { Loader2 } from "lucide-react";

interface LoadingPlaceholderProps extends React.HTMLAttributes<HTMLDivElement> {
  avatarId?: string;
  loadingAnimationUrl?: string | null;
}

const avatarGifs: Record<string, string> = {
  "mark-kohl": "/attached_assets/mark_1769406181436.gif",
  "mark": "/attached_assets/mark_1769406181436.gif",
  "willie-gault": "/attached_assets/willie_intro_gif_1769406181436.gif",
  "willie": "/attached_assets/willie_intro_gif_1769406181436.gif",
  "june": "/attached_assets/june_gif_1769406181436.gif",
  "thad": "/attached_assets/thad_gif_1769406181435.gif",
  "nigel": "/attached_assets/Nigel-Loop-avatar_1763964600000.gif",
  "ann": "/attached_assets/ann_gif_1769406181436.gif",
  "kelsey": "/attached_assets/kelsey_gif_1769406181436.gif",
  "judy": "/attached_assets/judy__1769406181436.gif",
  "dexter": "/attached_assets/dexter_gif_1769406181435.gif",
  "shawn": "/attached_assets/shawn_gif_1769406181436.gif",
};

const avatarsWithIntroVideo = new Set([
  "mark-kohl", "mark", "willie-gault", "willie", "june", "thad",
  "ann", "kelsey", "judy", "dexter", "shawn"
]);

export function LoadingPlaceholder({ 
  className = "", 
  avatarId = "mark-kohl",
  loadingAnimationUrl: propAnimationUrl,
  ...props 
}: LoadingPlaceholderProps) {
  const [mediaLoaded, setMediaLoaded] = useState(false);
  const [mediaError, setMediaError] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    setMediaLoaded(false);
    setMediaError(false);
    setVideoFailed(false);
  }, [avatarId, propAnimationUrl]);

  const tryUnmute = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.muted) return;
    video.muted = false;
    video.play().catch(() => {
      video.muted = true;
    });
  }, []);

  const normalizedId = avatarId.toLowerCase();
  const hasIntroVideo = !propAnimationUrl && avatarsWithIntroVideo.has(normalizedId);
  const introVideoUrl = hasIntroVideo ? `/api/intro-video/${encodeURIComponent(normalizedId)}` : null;

  useEffect(() => {
    if (!introVideoUrl || videoFailed) return;
    const handler = () => tryUnmute();
    document.addEventListener('click', handler, { once: true });
    document.addEventListener('touchstart', handler, { once: true });
    return () => {
      document.removeEventListener('click', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [introVideoUrl, videoFailed, tryUnmute]);

  if (propAnimationUrl) {
    const rawMediaSrc = propAnimationUrl;
    const isVideo = rawMediaSrc && (
      rawMediaSrc.endsWith('.mp4') || 
      rawMediaSrc.endsWith('.webm') ||
      rawMediaSrc.includes('mp4') ||
      rawMediaSrc.includes('webm')
    );
    const mediaSrc = rawMediaSrc.startsWith('/attached_assets/') 
      ? `/attached_assets/${encodeURIComponent(rawMediaSrc.replace('/attached_assets/', ''))}`
      : rawMediaSrc;

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
            className={`w-full h-full object-contain md:object-cover transition-opacity duration-300 ${mediaLoaded && !mediaError ? 'opacity-100' : 'opacity-0'}`}
            onLoadedData={() => setMediaLoaded(true)}
            onError={() => setMediaError(true)}
            data-testid="avatar-video"
          />
          <p className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white/80 text-sm z-20">Starting session...</p>
        </div>
      );
    }

    return (
      <div className={`absolute inset-0 flex items-center justify-center bg-black ${className}`} {...props}>
        {(!mediaLoaded || mediaError) && (
          <div className="absolute inset-0 flex items-center justify-center bg-black z-10">
            <Loader2 className="w-12 h-12 text-violet-400 animate-spin" />
          </div>
        )}
        <img
          src={mediaSrc}
          alt="Avatar"
          className={`w-full h-full object-contain md:object-cover transition-opacity duration-300 ${mediaLoaded && !mediaError ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setMediaLoaded(true)}
          onError={() => setMediaError(true)}
          data-testid="avatar-gif"
        />
        <p className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white/80 text-sm z-20">Starting session...</p>
      </div>
    );
  }

  const useIntroVideo = introVideoUrl && !videoFailed;
  const gifSrc = avatarGifs[normalizedId] || avatarGifs[avatarId] || avatarGifs["mark-kohl"];
  const encodedGifSrc = gifSrc.startsWith('/attached_assets/')
    ? `/attached_assets/${encodeURIComponent(gifSrc.replace('/attached_assets/', ''))}`
    : gifSrc;

  return (
    <div className={`absolute inset-0 flex items-center justify-center bg-black ${className}`} {...props}>
      {(!mediaLoaded || mediaError) && (
        <div className="absolute inset-0 flex items-center justify-center bg-black z-10">
          <Loader2 className="w-12 h-12 text-violet-400 animate-spin" />
        </div>
      )}
      {useIntroVideo ? (
        <video
          ref={videoRef}
          src={introVideoUrl}
          autoPlay
          loop
          muted
          playsInline
          className={`w-full h-full object-contain md:object-cover transition-opacity duration-300 ${mediaLoaded && !mediaError ? 'opacity-100' : 'opacity-0'}`}
          onLoadedData={() => {
            setMediaLoaded(true);
            tryUnmute();
          }}
          onError={() => {
            setVideoFailed(true);
            setMediaLoaded(false);
            setMediaError(false);
          }}
          data-testid="avatar-intro-video"
        />
      ) : (
        <img
          src={encodedGifSrc}
          alt="Avatar"
          className={`w-full h-full object-contain md:object-cover transition-opacity duration-300 ${mediaLoaded && !mediaError ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setMediaLoaded(true)}
          onError={() => setMediaError(true)}
          data-testid="avatar-gif"
        />
      )}
      <p className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white/80 text-sm z-20">Starting session...</p>
    </div>
  );
}
