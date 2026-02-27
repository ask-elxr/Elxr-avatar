import { useRef, useEffect, useCallback } from 'react';

interface ChromaKeyOptions {
  enabled: boolean;
  minHue?: number;
  maxHue?: number;
  minSaturation?: number;
  luminanceMin?: number;
  luminanceMax?: number;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) * 60; break;
      case g: h = ((b - r) / d + 2) * 60; break;
      case b: h = ((r - g) / d + 4) * 60; break;
    }
  }
  return [h, s, l];
}

export function useChromaKey(
  videoRef: React.RefObject<HTMLVideoElement>,
  canvasRef: React.RefObject<HTMLCanvasElement>,
  options: ChromaKeyOptions
) {
  const animFrameRef = useRef<number>(0);
  const activeRef = useRef(false);

  const {
    enabled,
    minHue = 70,
    maxHue = 170,
    minSaturation = 0.15,
    luminanceMin = 0.1,
    luminanceMax = 0.85,
  } = options;

  const processFrame = useCallback(() => {
    if (!activeRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) {
      animFrameRef.current = requestAnimationFrame(processFrame);
      return;
    }

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      animFrameRef.current = requestAnimationFrame(processFrame);
      return;
    }

    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;

    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      const [h, s, l] = rgbToHsl(r, g, b);

      if (h >= minHue && h <= maxHue && s >= minSaturation && l >= luminanceMin && l <= luminanceMax) {
        pixels[i] = 0;
        pixels[i + 1] = 0;
        pixels[i + 2] = 0;
        pixels[i + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    animFrameRef.current = requestAnimationFrame(processFrame);
  }, [videoRef, canvasRef, minHue, maxHue, minSaturation, luminanceMin, luminanceMax]);

  useEffect(() => {
    if (enabled) {
      activeRef.current = true;
      animFrameRef.current = requestAnimationFrame(processFrame);
    } else {
      activeRef.current = false;
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    }

    return () => {
      activeRef.current = false;
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [enabled, processFrame]);
}
