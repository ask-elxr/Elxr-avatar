import { useEffect, useState } from "react";

interface AudioOnlyDisplayProps {
  isSpeaking: boolean;
  sessionActive: boolean;
}

export function AudioOnlyDisplay({ isSpeaking, sessionActive }: AudioOnlyDisplayProps) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black">
      <div className="relative">
        <div className="relative z-10 flex items-center justify-center">
          <svg
            width="120"
            height="120"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-purple-500"
          >
            <path d="M11 5L6 9H2v6h4l5 4V5z" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
          </svg>
        </div>
        
        {isSpeaking && sessionActive && (
          <div className="absolute inset-0 flex items-center justify-center">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="absolute rounded-full border-2 border-purple-500"
                style={{
                  width: `${60 + i * 40}px`,
                  height: `${60 + i * 40}px`,
                  opacity: 0.4 - (i * 0.1),
                  animation: `pulse-wave ${1.5 + i * 0.3}s ease-out infinite`,
                  animationDelay: `${i * 0.2}s`,
                }}
              />
            ))}
          </div>
        )}
      </div>
      
      <div className="absolute bottom-20 text-white text-center">
        <p className="text-lg font-medium">
          {!sessionActive ? "Starting audio session..." : isSpeaking ? "Speaking..." : "Audio-only mode"}
        </p>
      </div>
    </div>
  );
}
