interface AudioOnlyDisplayProps {
  isSpeaking: boolean;
  sessionActive: boolean;
  avatarId?: string;
}

const avatarGifs: Record<string, string> = {
  'mark-kohl': '/attached_assets/MArk-kohl-loop_1763964600000.gif',
  'willie-gault': '/attached_assets/Willie gault gif-low_1763964813725.gif',
  'june': '/attached_assets/June-low_1764106896823.gif',
  'thad': '/attached_assets/Thad_1763963906199.gif',
  'nigel': '/attached_assets/Nigel-Loop-avatar_1763964600000.gif',
  'ann': '/attached_assets/Ann_1763966361095.gif',
  'kelsey': '/attached_assets/Kelsey_1764111279103.gif',
  'judy': '/attached_assets/Screen Recording 2025-07-14 at 14.35.37-low_1764106921758.gif',
  'dexter': '/attached_assets/DexterDoctor-ezgif.com-loop-count_1764111811631.gif',
  'shawn': '/attached_assets/Screen Recording 2025-07-14 at 14.41.54-low_1764106970821.gif',
};

export function AudioOnlyDisplay({ isSpeaking, sessionActive, avatarId = 'mark-kohl' }: AudioOnlyDisplayProps) {
  const gifUrl = avatarGifs[avatarId] || avatarGifs['mark-kohl'];
  
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black">
      <div className="relative flex items-center justify-center">
        {/* Radiating Circles - Behind the Avatar */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {isSpeaking && sessionActive && (
            <>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="absolute rounded-full"
                  style={{
                    width: `${280 + i * 70}px`,
                    height: `${280 + i * 70}px`,
                    background: `radial-gradient(circle, transparent 60%, rgba(139, 92, 246, ${0.4 - i * 0.06}) 80%, rgba(99, 102, 241, ${0.3 - i * 0.05}) 100%)`,
                    boxShadow: `0 0 ${20 + i * 10}px rgba(139, 92, 246, ${0.3 - i * 0.05}), inset 0 0 ${15 + i * 8}px rgba(99, 102, 241, ${0.2 - i * 0.03})`,
                    animation: `pulse-ring ${1.5 + i * 0.25}s ease-out infinite`,
                    animationDelay: `${i * 0.2}s`,
                  }}
                />
              ))}
            </>
          )}
          
          {/* Static subtle ring when not speaking */}
          {!isSpeaking && sessionActive && (
            <div 
              className="absolute rounded-full"
              style={{
                width: '280px',
                height: '280px',
                background: 'radial-gradient(circle, transparent 70%, rgba(139, 92, 246, 0.15) 90%, rgba(99, 102, 241, 0.1) 100%)',
                boxShadow: '0 0 20px rgba(139, 92, 246, 0.2), inset 0 0 15px rgba(99, 102, 241, 0.1)',
              }}
            />
          )}
        </div>
        
        {/* Avatar GIF - Circular with glow effect */}
        <div className="relative z-10">
          <div 
            className={`relative rounded-full overflow-hidden transition-all duration-300 ${
              isSpeaking ? 'ring-4 ring-violet-400/60 shadow-[0_0_80px_rgba(139,92,246,0.5)]' : 'ring-2 ring-violet-400/30'
            }`}
            style={{
              width: '240px',
              height: '240px',
            }}
          >
            <img
              src={gifUrl}
              alt="AI Avatar"
              className="w-full h-full object-cover"
              data-testid="avatar-gif"
            />
          </div>
        </div>
      </div>
      
      {/* Status Text */}
      <div className="absolute bottom-24 left-0 right-0 text-center">
        <p className="text-lg font-medium text-white/90">
          {!sessionActive ? "Starting audio session..." : isSpeaking ? "Speaking..." : "Listening..."}
        </p>
        <p className="text-sm text-white/60 mt-1">Audio Mode</p>
      </div>
      
      {/* CSS Keyframes for radiating animation */}
      <style>{`
        @keyframes pulse-ring {
          0% {
            transform: scale(1);
            opacity: 0.6;
          }
          50% {
            opacity: 0.3;
          }
          100% {
            transform: scale(1.15);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
