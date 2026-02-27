let sharedAudioElement: HTMLAudioElement | null = null;
let audioUnlocked = false;
let audioContext: AudioContext | null = null;

// Session token to prevent voice overlap between avatar switches
let currentSessionToken = 0;

// Global volume setting (0.0 to 1.0), persisted in localStorage
const VOLUME_STORAGE_KEY = 'avatar-volume';
let globalVolume = 1.0;

// Initialize volume from localStorage
if (typeof window !== 'undefined') {
  const storedVolume = localStorage.getItem(VOLUME_STORAGE_KEY);
  if (storedVolume !== null) {
    const parsed = parseFloat(storedVolume);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
      globalVolume = parsed;
    }
  }
}

export function getGlobalVolume(): number {
  return globalVolume;
}

// Track all active audio/video elements for volume updates
const activeMediaElements = new Set<HTMLAudioElement | HTMLVideoElement>();

export function registerMediaElement(element: HTMLAudioElement | HTMLVideoElement): void {
  activeMediaElements.add(element);
  element.volume = globalVolume;
}

export function unregisterMediaElement(element: HTMLAudioElement | HTMLVideoElement): void {
  activeMediaElements.delete(element);
}

export function setGlobalVolume(volume: number): void {
  globalVolume = Math.max(0, Math.min(1, volume));
  if (typeof window !== 'undefined') {
    localStorage.setItem(VOLUME_STORAGE_KEY, globalVolume.toString());
  }
  // Apply to shared audio element if it exists
  if (sharedAudioElement) {
    sharedAudioElement.volume = globalVolume;
  }
  // Apply to all tracked active media elements
  activeMediaElements.forEach(element => {
    element.volume = globalVolume;
  });
  console.log('🔊 Global volume set to:', globalVolume, '- updated', activeMediaElements.size, 'active elements');
}

export function incrementSessionToken(): number {
  currentSessionToken++;
  console.log('🔄 Session token incremented to:', currentSessionToken);
  return currentSessionToken;
}

export function getCurrentSessionToken(): number {
  return currentSessionToken;
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))
  ]);
}

export function isAudioUnlocked(): boolean {
  return audioUnlocked;
}

export function getSharedAudioElement(): HTMLAudioElement {
  if (!sharedAudioElement) {
    sharedAudioElement = document.createElement('audio');
    sharedAudioElement.setAttribute('playsinline', 'true');
    sharedAudioElement.setAttribute('webkit-playsinline', 'true');
    sharedAudioElement.preload = 'auto';
    sharedAudioElement.volume = globalVolume;
    // Register shared element for volume updates
    activeMediaElements.add(sharedAudioElement);
  }
  return sharedAudioElement;
}

// 📱 iOS FIX: Create a fresh audio element for each playback
// This avoids the issue where reused audio elements get stuck on iOS Safari
// Automatically registers for volume updates and unregisters on end/error
export function createFreshAudioElement(): HTMLAudioElement {
  const audio = document.createElement('audio');
  audio.setAttribute('playsinline', 'true');
  audio.setAttribute('webkit-playsinline', 'true');
  audio.preload = 'auto';
  audio.volume = globalVolume;
  
  // Register for volume updates
  activeMediaElements.add(audio);
  
  // Auto-unregister when playback ends or errors
  const cleanup = () => {
    activeMediaElements.delete(audio);
  };
  audio.addEventListener('ended', cleanup, { once: true });
  audio.addEventListener('error', cleanup, { once: true });
  
  return audio;
}

export function getAudioContext(): AudioContext | null {
  return audioContext;
}

export function createOrGetAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioContext;
}

export async function ensureAudioContextResumed(): Promise<boolean> {
  try {
    const ctx = createOrGetAudioContext();
    if (ctx.state === 'suspended') {
      console.log('📱 AudioContext suspended, attempting resume...');
      const resumed = await withTimeout(
        ctx.resume().then(() => true),
        1000,
        false
      );
      if (resumed) {
        console.log('📱 AudioContext resumed successfully, state:', ctx.state);
      } else {
        console.warn('📱 AudioContext resume timed out');
      }
    }
    return ctx.state === 'running';
  } catch (error) {
    console.error('📱 Failed to resume AudioContext:', error);
    return false;
  }
}

export async function unlockMobileAudio(): Promise<boolean> {
  if (audioUnlocked) {
    console.log('📱 Mobile audio already unlocked');
    return true;
  }

  try {
    console.log('📱 Unlocking mobile audio...');
    
    const ctx = createOrGetAudioContext();
    
    if (ctx.state === 'suspended') {
      const resumed = await withTimeout(
        ctx.resume().then(() => true),
        1000,
        false
      );
      if (resumed) {
        console.log('📱 AudioContext resumed, state:', ctx.state);
      } else {
        console.warn('📱 AudioContext resume timed out, continuing anyway');
      }
    }
    
    const audio = getSharedAudioElement();
    
    const silentDataUri = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
    audio.src = silentDataUri;
    
    try {
      const playResult = await withTimeout(
        audio.play().then(() => 'success' as const),
        1000,
        'timeout' as const
      );
      
      if (playResult === 'success') {
        audio.pause();
        audio.currentTime = 0;
        audio.src = '';
        audioUnlocked = true;
        console.log('📱 Mobile audio unlocked successfully via silent play');
        return true;
      } else {
        console.warn('📱 Silent audio play timed out');
        audio.pause();
        audio.src = '';
      }
    } catch (playError: any) {
      console.warn('📱 Silent audio play failed:', playError.name, playError.message);
      audio.pause();
      audio.src = '';
    }
    
    if (ctx.state === 'running') {
      audioUnlocked = true;
      console.log('📱 AudioContext is running - marking audio as unlocked despite play issues');
      return true;
    }
    
    console.warn('📱 Audio unlock incomplete, but continuing to avoid blocking');
    return false;
  } catch (error) {
    console.error('📱 Failed to unlock mobile audio:', error);
    return false;
  }
}

export async function ensureAudioUnlocked(): Promise<boolean> {
  if (audioUnlocked) {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      console.log('📱 Audio was unlocked but context suspended, resuming...');
      try {
        const resumed = await withTimeout(
          ctx.resume().then(() => true),
          1000,
          false
        );
        if (resumed) {
          console.log('📱 Context resumed after suspend');
        } else {
          console.warn('📱 Context resume timed out');
        }
      } catch (e) {
        console.error('📱 Failed to resume suspended context:', e);
      }
    }
    return true;
  }
  
  return await withTimeout(unlockMobileAudio(), 2000, false);
}

// 📱 Play audio blob - resolves when playback STARTS (not ends)
// Returns the audio element so caller can attach onended handler
// Now accepts optional sessionToken to prevent voice overlap
export async function playAudioBlob(blob: Blob, sessionToken?: number): Promise<HTMLAudioElement> {
  // 🔇 CRITICAL: Check session token BEFORE any async operations
  // This prevents stale audio from previous avatars from playing
  if (sessionToken !== undefined && sessionToken !== currentSessionToken) {
    console.log('🔇 Blocking stale audio playback - token mismatch:', sessionToken, '!==', currentSessionToken);
    throw new Error('Session token mismatch - audio cancelled');
  }
  
  await ensureAudioUnlocked();
  await ensureAudioContextResumed();
  
  // 🔇 Check again after async operations
  if (sessionToken !== undefined && sessionToken !== currentSessionToken) {
    console.log('🔇 Blocking stale audio playback after unlock - token mismatch');
    throw new Error('Session token mismatch - audio cancelled');
  }
  
  const audio = getSharedAudioElement();
  
  // 📱 CRITICAL: Fully reset audio element before reuse (iOS requires this)
  audio.pause();
  audio.currentTime = 0;
  
  const previousSrc = audio.src;
  if (previousSrc && previousSrc.startsWith('blob:')) {
    URL.revokeObjectURL(previousSrc);
  }
  audio.src = '';
  
  const audioUrl = URL.createObjectURL(blob);
  audio.src = audioUrl;
  audio.volume = globalVolume;
  audio.muted = false;
  
  return new Promise((resolve, reject) => {
    audio.onerror = (e) => {
      URL.revokeObjectURL(audioUrl);
      reject(new Error(`Audio playback error: ${audio.error?.message || 'unknown'}`));
    };

    audio.oncanplaythrough = async () => {
      audio.oncanplaythrough = null; // Clear to prevent multiple calls
      
      // 🔇 Final check before playing
      if (sessionToken !== undefined && sessionToken !== currentSessionToken) {
        console.log('🔇 Blocking stale audio at canplaythrough - token mismatch');
        URL.revokeObjectURL(audioUrl);
        reject(new Error('Session token mismatch - audio cancelled'));
        return;
      }
      
      try {
        console.log('🔊 Audio ready, volume:', audio.volume, 'muted:', audio.muted, 'unlocked:', audioUnlocked, 'sessionToken:', sessionToken);
        await audio.play();
        console.log('🔊 Audio playback STARTED - duration:', audio.duration.toFixed(2) + 's');
        // Resolve immediately after play starts - caller handles onended
        resolve(audio);
      } catch (playError: any) {
        console.error('🔊 Audio play failed:', playError.name, playError.message);
        URL.revokeObjectURL(audioUrl);
        reject(playError);
      }
    };

    audio.load();
  });
}

export function stopSharedAudio(): void {
  if (sharedAudioElement) {
    sharedAudioElement.pause();
    sharedAudioElement.currentTime = 0;
    if (sharedAudioElement.src && sharedAudioElement.src.startsWith('blob:')) {
      URL.revokeObjectURL(sharedAudioElement.src);
    }
    sharedAudioElement.src = '';
  }
}

export function resetAudioUnlockState(): void {
  audioUnlocked = false;
}
