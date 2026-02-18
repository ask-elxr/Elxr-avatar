// Web Worker for Safari iOS - bypasses main thread suspension
// Safari iOS 17 throttles the main document event loop after a tap,
// but workers remain active

self.onmessage = async (event) => {
  const { type, payload } = event.data;
  
  if (type === 'START_SESSION') {
    const { avatarId, audioOnly, userId, memberstackId, adminSecret } = payload;
    
    const authHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (memberstackId) authHeaders['X-Member-Id'] = memberstackId;
    if (adminSecret) authHeaders['X-Admin-Secret'] = adminSecret;
    
    try {
      // First, end any previous sessions
      try {
        await fetch('/api/session/end-all', {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ userId }),
        });
      } catch (e) {
        // Ignore cleanup errors
      }
      
      // Register session with server
      const response = await fetch('/api/session/start', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ avatarId, audioOnly }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to start session');
      }
      
      const data = await response.json();
      
      self.postMessage({
        type: 'SESSION_REGISTERED',
        payload: { sessionId: data.sessionId }
      });
    } catch (error: any) {
      self.postMessage({
        type: 'SESSION_ERROR',
        payload: { error: error.message || 'Failed to start session' }
      });
    }
  }
};
