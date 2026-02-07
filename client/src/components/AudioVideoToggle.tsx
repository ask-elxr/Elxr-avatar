import { Volume2, Video, MessageSquare } from "lucide-react";

export type ChatMode = 'text' | 'audio' | 'video';

interface AudioVideoToggleProps {
  isVideoMode: boolean;
  onToggle: (isVideo: boolean) => void;
  disabled?: boolean;
  enableAudioMode?: boolean;
  enableVideoMode?: boolean;
  chatMode?: ChatMode;
  onModeChange?: (mode: ChatMode) => void;
}

export function AudioVideoToggle({ 
  isVideoMode, 
  onToggle, 
  disabled = false,
  enableAudioMode = true,
  enableVideoMode = true,
  chatMode,
  onModeChange,
}: AudioVideoToggleProps) {
  const bothDisabled = !enableAudioMode && !enableVideoMode;
  const onlyAudio = enableAudioMode && !enableVideoMode;
  const onlyVideo = !enableAudioMode && enableVideoMode;
  
  if (bothDisabled) {
    return null;
  }

  const useTripleMode = !!onModeChange;
  const currentMode = chatMode || (isVideoMode ? 'video' : 'audio');

  if (useTripleMode) {
    const modes: { id: ChatMode; icon: typeof MessageSquare; label: string; enabled: boolean }[] = [
      { id: 'text', icon: MessageSquare, label: 'Text', enabled: true },
      { id: 'audio', icon: Volume2, label: 'Audio', enabled: enableAudioMode },
      { id: 'video', icon: Video, label: 'Video', enabled: enableVideoMode },
    ];

    const availableModes = modes.filter(m => m.enabled);

    return (
      <div 
        className="inline-flex items-center bg-black/60 backdrop-blur-sm rounded-full p-1"
        data-testid="audio-video-toggle"
      >
        {availableModes.map((mode) => {
          const Icon = mode.icon;
          const isActive = currentMode === mode.id;
          return (
            <button
              key={mode.id}
              onClick={() => {
                if (!disabled) {
                  onModeChange!(mode.id);
                  if (mode.id === 'video') onToggle(true);
                  else if (mode.id === 'audio') onToggle(false);
                }
              }}
              disabled={disabled}
              className={`flex items-center gap-1 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full text-xs sm:text-sm font-medium transition-all duration-300 ${
                isActive
                  ? "bg-white/20 text-white shadow-lg"
                  : "text-white/60 hover:text-white/80"
              } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
              data-testid={`toggle-${mode.id}`}
            >
              <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span>{mode.label}</span>
            </button>
          );
        })}
      </div>
    );
  }
  
  if (onlyAudio) {
    return (
      <div 
        className="inline-flex items-center bg-black/60 backdrop-blur-sm rounded-full px-4 py-2"
        data-testid="audio-video-toggle"
      >
        <Volume2 className="w-4 h-4 text-white mr-2" />
        <span className="text-sm font-medium text-white">Audio Only</span>
      </div>
    );
  }
  
  if (onlyVideo) {
    if (!isVideoMode) {
      return (
        <div 
          className="inline-flex items-center bg-amber-600/60 backdrop-blur-sm rounded-full px-4 py-2 border border-amber-400/40"
          data-testid="audio-video-toggle"
        >
          <Volume2 className="w-4 h-4 text-white mr-2" />
          <span className="text-sm font-medium text-white">Audio Fallback</span>
        </div>
      );
    }
    return (
      <div 
        className="inline-flex items-center bg-black/60 backdrop-blur-sm rounded-full px-4 py-2"
        data-testid="audio-video-toggle"
      >
        <Video className="w-4 h-4 text-white mr-2" />
        <span className="text-sm font-medium text-white">Video Only</span>
      </div>
    );
  }
  
  return (
    <div 
      className="inline-flex items-center bg-black/60 backdrop-blur-sm rounded-full p-1"
      data-testid="audio-video-toggle"
    >
      <button
        onClick={() => {
          if (!disabled) onToggle(false);
        }}
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
        onClick={() => {
          if (!disabled) onToggle(true);
        }}
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
