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

export async function unlockMobileAudio(): Promise<boolean> {
  if (audioUnlocked) {
    console.log('📱 Mobile audio already unlocked');
    return true;
  }

  try {
    console.log('📱 Unlocking mobile audio...');
    
    if (!audioContext) {
      audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }
    
    const audio = getSharedAudioElement();
    
    const silentDataUri = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
    audio.src = silentDataUri;
    
    await audio.play();
    audio.pause();
    audio.currentTime = 0;
    audio.src = '';
    
    audioUnlocked = true;
    console.log('📱 Mobile audio unlocked successfully');
    return true;
  } catch (error) {
    console.error('📱 Failed to unlock mobile audio:', error);
    return false;
  }
}

export async function playAudioBlob(blob: Blob): Promise<HTMLAudioElement> {
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
        await audio.play();
        console.log('📱 Audio playback started via shared element');
      } catch (playError) {
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

export function getAudioContext(): AudioContext | null {
  return audioContext;
}
