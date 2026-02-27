let micPermissionGranted: boolean = false;
let micPermissionPromise: Promise<void> | null = null;
let cachedConstraints: MediaStreamConstraints | null = null;

export async function requestMicrophoneOnce(options?: MediaStreamConstraints): Promise<MediaStream> {
  const constraints = options || {
    audio: {
      sampleRate: 16000,
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    }
  };
  
  if (micPermissionGranted) {
    console.log("🎤 Microphone already granted - creating fresh stream");
    return navigator.mediaDevices.getUserMedia(constraints);
  }
  
  if (micPermissionPromise) {
    console.log("🎤 Waiting for existing mic permission request...");
    await micPermissionPromise;
    return navigator.mediaDevices.getUserMedia(constraints);
  }
  
  console.log("🎤 Requesting microphone permission (first time this session)...");
  cachedConstraints = constraints;
  
  micPermissionPromise = navigator.mediaDevices.getUserMedia(constraints)
    .then(stream => {
      micPermissionGranted = true;
      console.log("✅ Microphone permission granted");
      stream.getTracks().forEach(track => track.stop());
    })
    .finally(() => {
      micPermissionPromise = null;
    });
  
  await micPermissionPromise;
  return navigator.mediaDevices.getUserMedia(constraints);
}

export function isMicPermissionGranted(): boolean {
  return micPermissionGranted;
}

export function resetMicPermission(): void {
  micPermissionGranted = false;
  console.log("🎤 Microphone permission state reset");
}
