import { useState, useCallback, useEffect, useRef } from 'react';

interface FullscreenState {
  isFullscreen: boolean;
  isSupported: boolean;
  isMobile: boolean;
  isIOS: boolean;
  isPseudoFullscreen: boolean;
}

interface UseFullscreenReturn extends FullscreenState {
  enterFullscreen: (element?: HTMLElement | null, videoElement?: HTMLVideoElement | null) => Promise<void>;
  exitFullscreen: () => Promise<void>;
  toggleFullscreen: (element?: HTMLElement | null, videoElement?: HTMLVideoElement | null) => Promise<void>;
}

export function useFullscreen(): UseFullscreenReturn {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPseudoFullscreen, setIsPseudoFullscreen] = useState(false);
  const [isIOSVideoFullscreen, setIsIOSVideoFullscreen] = useState(false);
  const currentElementRef = useRef<HTMLElement | null>(null);
  const currentVideoRef = useRef<HTMLVideoElement | null>(null);

  const isMobile = typeof navigator !== 'undefined' && (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    ('maxTouchPoints' in navigator && navigator.maxTouchPoints > 0)
  );

  const isIOS = typeof navigator !== 'undefined' && (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );

  const isNativeFullscreenSupported = typeof document !== 'undefined' && (
    'fullscreenEnabled' in document ||
    'webkitFullscreenEnabled' in document ||
    'mozFullScreenEnabled' in document ||
    'msFullscreenEnabled' in document
  );

  const isSupported = isNativeFullscreenSupported || isMobile;

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

  const applyPseudoFullscreen = useCallback((element: HTMLElement, enable: boolean) => {
    if (enable) {
      element.classList.add('pseudo-fullscreen');
      document.body.classList.add('pseudo-fullscreen-active');
      document.documentElement.classList.add('pseudo-fullscreen-active');
      if (isMobile) {
        window.scrollTo(0, 1);
      }
    } else {
      element.classList.remove('pseudo-fullscreen');
      document.body.classList.remove('pseudo-fullscreen-active');
      document.documentElement.classList.remove('pseudo-fullscreen-active');
    }
  }, [isMobile]);

  const handleIOSVideoFullscreenStart = useCallback(() => {
    setIsIOSVideoFullscreen(true);
    setIsFullscreen(true);
  }, []);

  const handleIOSVideoFullscreenEnd = useCallback(() => {
    setIsIOSVideoFullscreen(false);
    setIsFullscreen(false);
  }, []);

  const attachIOSVideoListeners = useCallback((videoElement: HTMLVideoElement) => {
    videoElement.addEventListener('webkitbeginfullscreen', handleIOSVideoFullscreenStart);
    videoElement.addEventListener('webkitendfullscreen', handleIOSVideoFullscreenEnd);
  }, [handleIOSVideoFullscreenStart, handleIOSVideoFullscreenEnd]);

  const detachIOSVideoListeners = useCallback((videoElement: HTMLVideoElement) => {
    videoElement.removeEventListener('webkitbeginfullscreen', handleIOSVideoFullscreenStart);
    videoElement.removeEventListener('webkitendfullscreen', handleIOSVideoFullscreenEnd);
  }, [handleIOSVideoFullscreenStart, handleIOSVideoFullscreenEnd]);

  const enterFullscreen = useCallback(async (element?: HTMLElement | null, videoElement?: HTMLVideoElement | null) => {
    const targetElement = element || document.documentElement;
    currentElementRef.current = targetElement as HTMLElement;
    
    if (videoElement) {
      currentVideoRef.current = videoElement;
    }

    // On iOS, native Fullscreen API is not available — go straight to pseudo-fullscreen
    // On Android Chrome, try native Fullscreen API first (hides browser chrome)
    if (isIOS) {
      applyPseudoFullscreen(targetElement as HTMLElement, true);
      setIsPseudoFullscreen(true);
      setIsFullscreen(true);
      return;
    }

    // Try native Fullscreen API (works on desktop and Android Chrome)
    try {
      if (targetElement.requestFullscreen) {
        await targetElement.requestFullscreen();
        return;
      } else if ((targetElement as any).webkitRequestFullscreen) {
        await (targetElement as any).webkitRequestFullscreen();
        return;
      } else if ((targetElement as any).mozRequestFullScreen) {
        await (targetElement as any).mozRequestFullScreen();
        return;
      } else if ((targetElement as any).msRequestFullscreen) {
        await (targetElement as any).msRequestFullscreen();
        return;
      }
    } catch (error) {
      console.log('Native fullscreen failed, falling back to pseudo-fullscreen:', error);
    }

    // Fallback: pseudo-fullscreen (CSS-based, won't hide browser chrome)
    applyPseudoFullscreen(targetElement as HTMLElement, true);
    setIsPseudoFullscreen(true);
    setIsFullscreen(true);
  }, [isIOS, applyPseudoFullscreen]);

  const exitFullscreen = useCallback(async () => {
    if (isIOSVideoFullscreen && currentVideoRef.current && 'webkitExitFullscreen' in currentVideoRef.current) {
      try {
        await (currentVideoRef.current as any).webkitExitFullscreen();
        return;
      } catch (error) {
        console.log('iOS video exitFullscreen failed:', error);
      }
    }

    if (isPseudoFullscreen && currentElementRef.current) {
      applyPseudoFullscreen(currentElementRef.current, false);
      setIsPseudoFullscreen(false);
      setIsFullscreen(false);
      return;
    }

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
  }, [isIOSVideoFullscreen, isPseudoFullscreen, applyPseudoFullscreen]);

  const toggleFullscreen = useCallback(async (element?: HTMLElement | null, videoElement?: HTMLVideoElement | null) => {
    if (isFullscreen || isPseudoFullscreen || isIOSVideoFullscreen) {
      await exitFullscreen();
    } else {
      await enterFullscreen(element, videoElement);
    }
  }, [isFullscreen, isPseudoFullscreen, isIOSVideoFullscreen, enterFullscreen, exitFullscreen]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const fsElement = getFullscreenElement();
      if (!isIOSVideoFullscreen && !isPseudoFullscreen) {
        setIsFullscreen(!!fsElement);
      }
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
  }, [getFullscreenElement, isIOSVideoFullscreen, isPseudoFullscreen]);

  useEffect(() => {
    return () => {
      if (currentVideoRef.current) {
        detachIOSVideoListeners(currentVideoRef.current);
      }
    };
  }, [detachIOSVideoListeners]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isPseudoFullscreen) {
        exitFullscreen();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isPseudoFullscreen, exitFullscreen]);

  return {
    isFullscreen: isFullscreen || isPseudoFullscreen || isIOSVideoFullscreen,
    isSupported,
    isMobile,
    isIOS,
    isPseudoFullscreen,
    enterFullscreen,
    exitFullscreen,
    toggleFullscreen,
  };
}
