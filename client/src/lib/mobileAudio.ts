let sharedAudioElement: HTMLAudioElement | null = null;
let audioUnlocked = false;
let audioContext: AudioContext | null = null;

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
    sharedAudioElement.volume = 1.0;
  }
  return sharedAudioElement;
}

// 📱 iOS FIX: Create a fresh audio element for each playback
// This avoids the issue where reused audio elements get stuck on iOS Safari
export function createFreshAudioElement(): HTMLAudioElement {
  const audio = document.createElement('audio');
  audio.setAttribute('playsinline', 'true');
  audio.setAttribute('webkit-playsinline', 'true');
  audio.preload = 'auto';
  audio.volume = 1.0;
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
export async function playAudioBlob(blob: Blob): Promise<HTMLAudioElement> {
  await ensureAudioUnlocked();
  await ensureAudioContextResumed();
  
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
  audio.volume = 1.0;
  audio.muted = false;
  
  return new Promise((resolve, reject) => {
    audio.onerror = (e) => {
      URL.revokeObjectURL(audioUrl);
      reject(new Error(`Audio playback error: ${audio.error?.message || 'unknown'}`));
    };

    audio.oncanplaythrough = async () => {
      audio.oncanplaythrough = null; // Clear to prevent multiple calls
      try {
        console.log('🔊 Audio ready, volume:', audio.volume, 'muted:', audio.muted, 'unlocked:', audioUnlocked);
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
