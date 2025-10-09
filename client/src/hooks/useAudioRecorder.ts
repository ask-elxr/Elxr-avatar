import { useState, useRef, useCallback, useEffect } from 'react';

interface UseAudioRecorderReturn {
  isRecording: boolean;
  isListening: boolean;
  startListening: () => Promise<void>;
  stopListening: () => void;
  error: string | null;
}

export function useAudioRecorder(onTranscript?: (text: string) => void): UseAudioRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isProcessingRef = useRef(false);

  const processAudio = useCallback(async () => {
    if (isProcessingRef.current || audioChunksRef.current.length === 0) return;
    
    isProcessingRef.current = true;
    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
    audioChunksRef.current = [];

    try {
      const formData = new FormData();
      formData.append('audio', audioBlob);
      
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        const { transcript } = await response.json();
        if (transcript && transcript.trim() && onTranscript) {
          onTranscript(transcript);
        }
      }
    } catch (err) {
      console.error('Transcription error:', err);
    } finally {
      isProcessingRef.current = false;
    }
  }, [onTranscript]);

  const stopRecordingChunk = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, []);

  const startRecordingChunk = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'inactive') {
      audioChunksRef.current = [];
      mediaRecorderRef.current.start();
      setIsRecording(true);
    }
  }, []);

  const checkAudioLevel = useCallback(() => {
    if (!analyserRef.current || !isListening) return;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);
    
    const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
    const threshold = 30;

    if (average > threshold) {
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
        silenceTimeoutRef.current = null;
      }
      
      if (!isRecording) {
        startRecordingChunk();
      }
    } else {
      if (isRecording && !silenceTimeoutRef.current) {
        silenceTimeoutRef.current = setTimeout(() => {
          stopRecordingChunk();
          processAudio();
          silenceTimeoutRef.current = null;
        }, 1500);
      }
    }

    if (isListening) {
      requestAnimationFrame(checkAudioLevel);
    }
  }, [isListening, isRecording, startRecordingChunk, stopRecordingChunk, processAudio]);

  const startListening = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      analyserRef.current = analyser;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      setIsListening(true);
      checkAudioLevel();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to access microphone';
      setError(errorMessage);
      console.error('Listening error:', err);
    }
  }, [checkAudioLevel]);

  const stopListening = useCallback(() => {
    setIsListening(false);
    
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    setIsRecording(false);
  }, []);

  useEffect(() => {
    return () => {
      stopListening();
    };
  }, [stopListening]);

  return {
    isRecording,
    isListening,
    startListening,
    stopListening,
    error
  };
}
