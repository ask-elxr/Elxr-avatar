import { QueryClient, QueryFunction } from "@tanstack/react-query";

// Get admin secret from URL params or localStorage
export function getAdminSecret(): string | null {
  // Check URL params first
  const urlParams = new URLSearchParams(window.location.search);
  const urlSecret = urlParams.get('admin_secret');
  if (urlSecret) {
    // Store in localStorage for persistence
    localStorage.setItem('admin_secret', urlSecret);
    return urlSecret;
  }
  // Check localStorage
  return localStorage.getItem('admin_secret');
}

// Get Memberstack user ID from URL params or localStorage
// This is used for persistent memory across sessions when embedded in Webflow
export function getMemberstackId(): string | null {
  // Check URL params first (member_id is passed from Webflow/Memberstack)
  const urlParams = new URLSearchParams(window.location.search);
  const urlMemberId = urlParams.get('member_id');
  if (urlMemberId) {
    // Store in localStorage for persistence across page navigations
    localStorage.setItem('memberstack_id', urlMemberId);
    return urlMemberId;
  }
  // Check localStorage for previously stored ID
  return localStorage.getItem('memberstack_id');
}

// Check if Memberstack ID is available
export function hasMemberstackId(): boolean {
  return !!getMemberstackId();
}

// Build authenticated WebSocket URL with member_id or admin_secret query params
export function buildAuthenticatedWsUrl(path: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = new URL(`${protocol}//${window.location.host}${path}`);
  const memberId = getMemberstackId();
  if (memberId) {
    url.searchParams.set('member_id', memberId);
  }
  const adminSecret = getAdminSecret();
  if (adminSecret) {
    url.searchParams.set('admin_secret', adminSecret);
  }
  return url.toString();
}

// Check if admin secret is configured
export function hasAdminAccess(): boolean {
  return !!getAdminSecret();
}

export function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const memberstackId = getMemberstackId();
  if (memberstackId) headers['X-Member-Id'] = memberstackId;
  const adminSecret = getAdminSecret();
  if (adminSecret) headers['X-Admin-Secret'] = adminSecret;
  return headers;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  url: string,
  method: string,
  data?: unknown | undefined,
): Promise<Response> {
  const headers: Record<string, string> = data ? { "Content-Type": "application/json" } : {};
  
  // Add Memberstack ID header for persistent user identification
  const memberstackId = getMemberstackId();
  if (memberstackId) {
    headers['X-Member-Id'] = memberstackId;
  }
  
  // Add admin secret header for admin routes
  if (url.includes('/api/admin') || url.includes('/api/pinecone') || url.includes('/api/documents') || url.includes('/api/knowledge') || url.includes('/api/google-drive')) {
    const adminSecret = getAdminSecret();
    if (adminSecret) {
      headers['X-Admin-Secret'] = adminSecret;
    }
  }
  
  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const url = queryKey.join("/") as string;
    const headers: Record<string, string> = {};
    
    // Add Memberstack ID header for persistent user identification
    const memberstackId = getMemberstackId();
    if (memberstackId) {
      headers['X-Member-Id'] = memberstackId;
    }
    
    // Add admin secret header for admin routes
    if (url.includes('/api/admin') || url.includes('/api/pinecone') || url.includes('/api/documents') || url.includes('/api/knowledge') || url.includes('/api/google-drive')) {
      const adminSecret = getAdminSecret();
      if (adminSecret) {
        headers['X-Admin-Secret'] = adminSecret;
      }
    }
    
    const res = await fetch(url, {
      credentials: "include",
      headers,
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
