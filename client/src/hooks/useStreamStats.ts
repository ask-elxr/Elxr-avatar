import { useState, useEffect, useRef } from 'react';
import type StreamingAvatar from '@heygen/streaming-avatar';

interface StreamStats {
  fps: number;
  bitrateKbps: number;
  frameWidth: number;
  frameHeight: number;
  audioLevel: number;
}

interface UseStreamStatsProps {
  avatarRef: React.MutableRefObject<StreamingAvatar | null>;
  sessionActive: boolean;
}

export function useStreamStats({ avatarRef, sessionActive }: UseStreamStatsProps): StreamStats {
  const [stats, setStats] = useState<StreamStats>({
    fps: 0,
    bitrateKbps: 0,
    frameWidth: 0,
    frameHeight: 0,
    audioLevel: 0,
  });

  const lastBytesReceivedRef = useRef<number>(0);
  const lastTimestampRef = useRef<number>(0);

  useEffect(() => {
    if (!sessionActive) {
      // Reset stats when session ends
      setStats({
        fps: 0,
        bitrateKbps: 0,
        frameWidth: 0,
        frameHeight: 0,
        audioLevel: 0,
      });
      lastBytesReceivedRef.current = 0;
      lastTimestampRef.current = 0;
      return;
    }

    const intervalId = setInterval(async () => {
      try {
        // Access the internal peer connection from HeyGen SDK
        // Note: This uses internal SDK properties which may change in future versions
        const avatar = avatarRef.current as any;
        const peerConnection = avatar?.peerConnection as RTCPeerConnection | undefined;

        // If peer connection isn't ready yet, wait for next poll
        if (!peerConnection) {
          return;
        }

        const statsReport = await peerConnection.getStats();
        
        let newFps = 0;
        let newBitrateKbps = 0;
        let newFrameWidth = 0;
        let newFrameHeight = 0;
        let newAudioLevel = 0;

        statsReport.forEach((report: any) => {
          // Video inbound RTP stats
          if (report.type === 'inbound-rtp' && report.kind === 'video') {
            // FPS calculation
            if (report.framesPerSecond !== undefined) {
              newFps = Math.round(report.framesPerSecond);
            }

            // Bitrate calculation
            const currentBytes = report.bytesReceived || 0;
            const currentTimestamp = report.timestamp || 0;

            if (lastBytesReceivedRef.current > 0 && lastTimestampRef.current > 0) {
              const bytesDiff = currentBytes - lastBytesReceivedRef.current;
              const timeDiff = (currentTimestamp - lastTimestampRef.current) / 1000; // Convert to seconds
              
              if (timeDiff > 0) {
                const bitsPerSecond = (bytesDiff * 8) / timeDiff;
                newBitrateKbps = Math.round(bitsPerSecond / 1000);
              }
            }

            lastBytesReceivedRef.current = currentBytes;
            lastTimestampRef.current = currentTimestamp;

            // Frame dimensions
            if (report.frameWidth) newFrameWidth = report.frameWidth;
            if (report.frameHeight) newFrameHeight = report.frameHeight;
          }

          // Audio inbound RTP stats
          if (report.type === 'inbound-rtp' && report.kind === 'audio') {
            // Audio level (0-1 scale, typically from track stats)
            if (report.audioLevel !== undefined) {
              newAudioLevel = Math.round(report.audioLevel * 100);
            }
          }

          // Alternative: get audio level from track stats
          if (report.type === 'track' && report.kind === 'audio') {
            if (report.audioLevel !== undefined) {
              newAudioLevel = Math.round(report.audioLevel * 100);
            }
          }
        });

        setStats({
          fps: newFps,
          bitrateKbps: newBitrateKbps,
          frameWidth: newFrameWidth,
          frameHeight: newFrameHeight,
          audioLevel: newAudioLevel,
        });
      } catch (error) {
        console.error('Error reading stream stats:', error);
      }
    }, 1000); // Update every second

    return () => {
      clearInterval(intervalId);
      lastBytesReceivedRef.current = 0;
      lastTimestampRef.current = 0;
    };
  }, [sessionActive, avatarRef]);

  return stats;
}
