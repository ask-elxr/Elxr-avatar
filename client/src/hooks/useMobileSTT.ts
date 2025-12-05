import { useState, useRef, useCallback } from 'react';

interface MobileSTTOptions {
  onTranscript: (text: string) => void;
  onError?: (error: string) => void;
  languageCode?: string;
}

interface MobileSTTReturn {
  isRecording: boolean;
  isProcessing: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<string | null>;
  cancelRecording: () => void;
  isSupported: boolean;
}

export function useMobileSTT({
  onTranscript,
  onError,
  languageCode = 'en',
}: MobileSTTOptions): MobileSTTReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const isSupported = typeof navigator !== 'undefined' && 
    navigator.mediaDevices && 
    typeof navigator.mediaDevices.getUserMedia === 'function' &&
    typeof MediaRecorder !== 'undefined';

  const cleanup = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
    audioChunksRef.current = [];
  }, []);

  const startRecording = useCallback(async () => {
    if (!isSupported) {
      onError?.('Audio recording not supported in this browser');
      return;
    }

    try {
      audioChunksRef.current = [];
      
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
        }
      });
      
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : MediaRecorder.isTypeSupported('audio/mp4')
            ? 'audio/mp4'
            : 'audio/wav';

      console.log(`🎙️ Mobile STT: Starting recording with mime type: ${mimeType}`);

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 128000,
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onerror = (event: any) => {
        console.error('MediaRecorder error:', event.error);
        onError?.('Recording failed');
        cleanup();
        setIsRecording(false);
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(100);
      setIsRecording(true);
      
      console.log('🎙️ Mobile STT: Recording started');
    } catch (error: any) {
      console.error('Failed to start recording:', error);
      if (error.name === 'NotAllowedError') {
        onError?.('Microphone permission denied');
      } else if (error.name === 'NotFoundError') {
        onError?.('No microphone found');
      } else {
        onError?.('Failed to start recording');
      }
      cleanup();
    }
  }, [isSupported, onError, cleanup]);

  const stopRecording = useCallback(async (): Promise<string | null> => {
    if (!mediaRecorderRef.current || !isRecording) {
      return null;
    }

    return new Promise((resolve) => {
      const mediaRecorder = mediaRecorderRef.current!;
      
      mediaRecorder.onstop = async () => {
        setIsRecording(false);
        setIsProcessing(true);
        
        console.log(`🎙️ Mobile STT: Recording stopped, ${audioChunksRef.current.length} chunks collected`);

        try {
          const audioBlob = new Blob(audioChunksRef.current, { 
            type: mediaRecorder.mimeType 
          });
          
          console.log(`🎙️ Mobile STT: Audio blob size: ${audioBlob.size} bytes`);

          if (audioBlob.size < 1000) {
            console.warn('🎙️ Mobile STT: Audio too short, ignoring');
            cleanup();
            setIsProcessing(false);
            resolve(null);
            return;
          }

          const audioData = await blobToBase64(audioBlob);
          
          console.log(`🎙️ Mobile STT: Sending audio to server for transcription (${audioData.mimeType})...`);
          
          const response = await fetch('/api/stt', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              audio: audioData.base64,
              mimeType: audioData.mimeType,
              languageCode,
            }),
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Transcription failed');
          }

          const result = await response.json();
          const transcribedText = result.text?.trim();
          
          console.log(`🎙️ Mobile STT: Transcribed text: "${transcribedText}"`);

          if (transcribedText) {
            onTranscript(transcribedText);
            resolve(transcribedText);
          } else {
            console.log('🎙️ Mobile STT: No speech detected');
            resolve(null);
          }
        } catch (error: any) {
          console.error('🎙️ Mobile STT: Transcription error:', error);
          onError?.(error.message || 'Failed to transcribe audio');
          resolve(null);
        } finally {
          cleanup();
          setIsProcessing(false);
        }
      };

      mediaRecorder.stop();
    });
  }, [isRecording, languageCode, onTranscript, onError, cleanup]);

  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {}
    }
    cleanup();
    setIsRecording(false);
    setIsProcessing(false);
    console.log('🎙️ Mobile STT: Recording cancelled');
  }, [isRecording, cleanup]);

  return {
    isRecording,
    isProcessing,
    startRecording,
    stopRecording,
    cancelRecording,
    isSupported,
  };
}

interface AudioData {
  base64: string;
  mimeType: string;
}

async function blobToBase64(blob: Blob): Promise<AudioData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      const base64Data = base64String.split(',')[1];
      resolve({
        base64: base64Data,
        mimeType: blob.type || 'audio/webm',
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
