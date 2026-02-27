import { useEffect, useCallback, useRef } from 'react';

const AUTH_CHANNEL_NAME = 'elxr-auth-sync';
const LOGOUT_EVENT_KEY = 'elxr-logout-event';

export function useAuthSync() {
  const channelRef = useRef<BroadcastChannel | null>(null);

  const broadcastLogout = useCallback(() => {
    try {
      if (channelRef.current) {
        channelRef.current.postMessage({ type: 'logout', timestamp: Date.now() });
      }
      localStorage.setItem(LOGOUT_EVENT_KEY, Date.now().toString());
    } catch (error) {
      console.warn('Failed to broadcast logout:', error);
    }
  }, []);

  const handleLogout = useCallback(() => {
    broadcastLogout();
    window.location.href = '/api/logout';
  }, [broadcastLogout]);

  useEffect(() => {
    try {
      channelRef.current = new BroadcastChannel(AUTH_CHANNEL_NAME);

      channelRef.current.onmessage = (event) => {
        if (event.data?.type === 'logout') {
          console.log('Logout detected from another tab, redirecting...');
          window.location.href = '/';
        }
      };
    } catch (error) {
      console.warn('BroadcastChannel not supported, using localStorage fallback');
    }

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === LOGOUT_EVENT_KEY && event.newValue) {
        console.log('Logout detected via localStorage, redirecting...');
        window.location.href = '/';
      }
    };

    window.addEventListener('storage', handleStorageChange);

    const checkSession = async () => {
      try {
        const response = await fetch('/api/auth/user', { credentials: 'include' });
        if (response.status === 401) {
          console.log('Session expired, redirecting...');
          window.location.href = '/';
        }
      } catch (error) {
      }
    };

    const sessionCheckInterval = setInterval(checkSession, 30000);

    return () => {
      if (channelRef.current) {
        channelRef.current.close();
      }
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(sessionCheckInterval);
    };
  }, []);

  return { handleLogout, broadcastLogout };
}

export function triggerLogoutSync() {
  try {
    const channel = new BroadcastChannel(AUTH_CHANNEL_NAME);
    channel.postMessage({ type: 'logout', timestamp: Date.now() });
    channel.close();
  } catch (error) {
  }
  localStorage.setItem(LOGOUT_EVENT_KEY, Date.now().toString());
}
