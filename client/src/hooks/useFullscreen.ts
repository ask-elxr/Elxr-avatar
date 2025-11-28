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

  // Detect mobile and iOS
  const isMobile = typeof navigator !== 'undefined' && (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    ('maxTouchPoints' in navigator && navigator.maxTouchPoints > 0)
  );

  const isIOS = typeof navigator !== 'undefined' && (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );

  // Check if native fullscreen API is supported
  const isNativeFullscreenSupported = typeof document !== 'undefined' && (
    'fullscreenEnabled' in document ||
    'webkitFullscreenEnabled' in document ||
    'mozFullScreenEnabled' in document ||
    'msFullscreenEnabled' in document
  );

  // On mobile, we always support fullscreen (via pseudo-fullscreen if needed)
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

  // Apply pseudo-fullscreen CSS classes
  const applyPseudoFullscreen = useCallback((element: HTMLElement, enable: boolean) => {
    if (enable) {
      element.classList.add('pseudo-fullscreen');
      document.body.classList.add('pseudo-fullscreen-active');
      document.documentElement.classList.add('pseudo-fullscreen-active');
      // Hide address bar on mobile by scrolling
      if (isMobile) {
        window.scrollTo(0, 1);
      }
    } else {
      element.classList.remove('pseudo-fullscreen');
      document.body.classList.remove('pseudo-fullscreen-active');
      document.documentElement.classList.remove('pseudo-fullscreen-active');
    }
  }, [isMobile]);

  // Handle iOS video fullscreen events
  const handleIOSVideoFullscreenStart = useCallback(() => {
    setIsIOSVideoFullscreen(true);
    setIsFullscreen(true);
  }, []);

  const handleIOSVideoFullscreenEnd = useCallback(() => {
    setIsIOSVideoFullscreen(false);
    setIsFullscreen(false);
  }, []);

  // Attach/detach iOS video fullscreen event listeners
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
    
    // Store video ref for later exit handling
    if (videoElement) {
      currentVideoRef.current = videoElement;
    }

    // Try iOS video fullscreen first (most reliable on iOS)
    if (isIOS && videoElement && 'webkitEnterFullscreen' in videoElement) {
      try {
        // Attach listeners before entering fullscreen
        attachIOSVideoListeners(videoElement);
        await (videoElement as any).webkitEnterFullscreen();
        // State will be set by the event listener
        return;
      } catch (error) {
        console.log('iOS video fullscreen not available, trying alternatives');
        detachIOSVideoListeners(videoElement);
      }
    }

    // Try native Fullscreen API
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
      console.log('Native fullscreen failed, using pseudo-fullscreen:', error);
    }

    // Fallback: Pseudo-fullscreen for mobile (especially iOS Safari)
    if (isMobile) {
      applyPseudoFullscreen(targetElement as HTMLElement, true);
      setIsPseudoFullscreen(true);
      setIsFullscreen(true);
    }
  }, [isIOS, isMobile, applyPseudoFullscreen, attachIOSVideoListeners, detachIOSVideoListeners]);

  const exitFullscreen = useCallback(async () => {
    // Exit iOS video fullscreen first
    if (isIOSVideoFullscreen && currentVideoRef.current && 'webkitExitFullscreen' in currentVideoRef.current) {
      try {
        await (currentVideoRef.current as any).webkitExitFullscreen();
        // State will be updated by the event listener
        return;
      } catch (error) {
        console.log('iOS video exitFullscreen failed:', error);
      }
    }

    // Exit pseudo-fullscreen
    if (isPseudoFullscreen && currentElementRef.current) {
      applyPseudoFullscreen(currentElementRef.current, false);
      setIsPseudoFullscreen(false);
      setIsFullscreen(false);
      return;
    }

    // Exit native fullscreen
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

  // Listen for native fullscreen changes
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

  // Cleanup iOS video listeners on unmount
  useEffect(() => {
    return () => {
      if (currentVideoRef.current) {
        detachIOSVideoListeners(currentVideoRef.current);
      }
    };
  }, [detachIOSVideoListeners]);

  // Handle escape key for pseudo-fullscreen
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
