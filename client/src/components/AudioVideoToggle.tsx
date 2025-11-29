import { Volume2, Video } from "lucide-react";

interface AudioVideoToggleProps {
  isVideoMode: boolean;
  onToggle: (isVideo: boolean) => void;
  disabled?: boolean;
}

export function AudioVideoToggle({ isVideoMode, onToggle, disabled = false }: AudioVideoToggleProps) {
  return (
    <div 
      className="inline-flex items-center bg-black/60 backdrop-blur-sm rounded-full p-1 border border-white/20"
      data-testid="audio-video-toggle"
    >
      <button
        onClick={() => !disabled && onToggle(false)}
        disabled={disabled}
        className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
          !isVideoMode
            ? "bg-white/20 text-white shadow-lg"
            : "text-white/60 hover:text-white/80"
        } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
        data-testid="toggle-audio"
      >
        <Volume2 className="w-4 h-4" />
        <span>Audio</span>
      </button>
      <button
        onClick={() => !disabled && onToggle(true)}
        disabled={disabled}
        className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
          isVideoMode
            ? "bg-white/20 text-white shadow-lg"
            : "text-white/60 hover:text-white/80"
        } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
        data-testid="toggle-video"
      >
        <Video className="w-4 h-4" />
        <span>Video</span>
      </button>
    </div>
  );
}
