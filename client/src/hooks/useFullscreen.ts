import { useState, useCallback, useEffect, useRef } from 'react';

interface FullscreenState {
  isFullscreen: boolean;
  isSupported: boolean;
}

interface UseFullscreenReturn extends FullscreenState {
  enterFullscreen: (element?: HTMLElement | null) => Promise<void>;
  exitFullscreen: () => Promise<void>;
  toggleFullscreen: (element?: HTMLElement | null) => Promise<void>;
}

export function useFullscreen(): UseFullscreenReturn {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const currentElementRef = useRef<HTMLElement | null>(null);

  const isSupported = typeof document !== 'undefined' && (
    'fullscreenEnabled' in document ||
    'webkitFullscreenEnabled' in document ||
    'mozFullScreenEnabled' in document ||
    'msFullscreenEnabled' in document
  );

  const getFullscreenElement = useCallback((): Element | null => {
    if (typeof document === 'undefined') return null;
    return (
      document.fullscreenElement ||
      (document as any).webkitFullscreenElement ||
      (document as any).mozFullScreenElement ||
      (document as any).msFullscreenElement ||
      null
    );
  }, []);

  const enterFullscreen = useCallback(async (element?: HTMLElement | null) => {
    const targetElement = element || document.documentElement;
    currentElementRef.current = targetElement as HTMLElement;

    try {
      if (targetElement.requestFullscreen) {
        await targetElement.requestFullscreen();
      } else if ((targetElement as any).webkitRequestFullscreen) {
        await (targetElement as any).webkitRequestFullscreen();
      } else if ((targetElement as any).mozRequestFullScreen) {
        await (targetElement as any).mozRequestFullScreen();
      } else if ((targetElement as any).msRequestFullscreen) {
        await (targetElement as any).msRequestFullscreen();
      }
    } catch (error) {
      console.error('Failed to enter fullscreen:', error);
    }
  }, []);

  const exitFullscreen = useCallback(async () => {
    try {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if ((document as any).webkitExitFullscreen) {
        await (document as any).webkitExitFullscreen();
      } else if ((document as any).mozCancelFullScreen) {
        await (document as any).mozCancelFullScreen();
      } else if ((document as any).msExitFullscreen) {
        await (document as any).msExitFullscreen();
      }
    } catch (error) {
      console.error('Failed to exit fullscreen:', error);
    }
  }, []);

  const toggleFullscreen = useCallback(async (element?: HTMLElement | null) => {
    if (getFullscreenElement()) {
      await exitFullscreen();
    } else {
      await enterFullscreen(element);
    }
  }, [getFullscreenElement, enterFullscreen, exitFullscreen]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!getFullscreenElement());
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, [getFullscreenElement]);

  return {
    isFullscreen,
    isSupported,
    enterFullscreen,
    exitFullscreen,
    toggleFullscreen,
  };
}
