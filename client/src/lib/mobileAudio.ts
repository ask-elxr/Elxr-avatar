let sharedAudioElement: HTMLAudioElement | null = null;
let audioUnlocked = false;
let audioContext: AudioContext | null = null;

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
      await ctx.resume();
      console.log('📱 AudioContext resumed successfully, state:', ctx.state);
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
      await ctx.resume();
      console.log('📱 AudioContext resumed, state:', ctx.state);
    }
    
    const audio = getSharedAudioElement();
    
    const silentDataUri = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
    audio.src = silentDataUri;
    
    try {
      await audio.play();
      audio.pause();
      audio.currentTime = 0;
      audio.src = '';
      audioUnlocked = true;
      console.log('📱 Mobile audio unlocked successfully via silent play');
      return true;
    } catch (playError: any) {
      console.warn('📱 Silent audio play failed:', playError.name, playError.message);
      if (ctx.state === 'running') {
        audioUnlocked = true;
        console.log('📱 AudioContext is running - marking audio as unlocked despite play failure');
        return true;
      }
      return false;
    }
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
        await ctx.resume();
        console.log('📱 Context resumed after suspend');
      } catch (e) {
        console.error('📱 Failed to resume suspended context:', e);
        return false;
      }
    }
    return true;
  }
  return await unlockMobileAudio();
}

export async function playAudioBlob(blob: Blob): Promise<HTMLAudioElement> {
  await ensureAudioUnlocked();
  
  const audio = getSharedAudioElement();
  
  const previousSrc = audio.src;
  if (previousSrc && previousSrc.startsWith('blob:')) {
    URL.revokeObjectURL(previousSrc);
  }
  
  const audioUrl = URL.createObjectURL(blob);
  audio.src = audioUrl;
  
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      audio.onended = null;
      audio.onerror = null;
      audio.oncanplaythrough = null;
    };

    audio.onended = () => {
      cleanup();
      URL.revokeObjectURL(audioUrl);
      resolve(audio);
    };

    audio.onerror = (e) => {
      cleanup();
      URL.revokeObjectURL(audioUrl);
      reject(new Error(`Audio playback error: ${audio.error?.message || 'unknown'}`));
    };

    audio.oncanplaythrough = async () => {
      try {
        console.log('🔊 Audio element configured, volume:', audio.volume, 'muted:', audio.muted, 'unlocked:', audioUnlocked);
        await audio.play();
        console.log('🔊 Audio playback STARTED via shared element - duration:', audio.duration.toFixed(2) + 's');
      } catch (playError: any) {
        console.error('🔊 Audio play failed:', playError.name, playError.message);
        cleanup();
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
