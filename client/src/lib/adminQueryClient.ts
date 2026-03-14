import { QueryClient, QueryFunction } from "@tanstack/react-query";

// API base URL for cross-domain requests (e.g., admin on Firebase calling main API)
export const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

// Get admin secret from URL params or localStorage
export function getAdminSecret(): string | null {
  const urlParams = new URLSearchParams(window.location.search);
  const urlSecret = urlParams.get('admin_secret');
  if (urlSecret) {
    localStorage.setItem('admin_secret', urlSecret);
    return urlSecret;
  }
  return localStorage.getItem('admin_secret');
}

export function setAdminSecret(secret: string): void {
  localStorage.setItem('admin_secret', secret);
}

export function clearAdminSecret(): void {
  localStorage.removeItem('admin_secret');
}

export function hasAdminAccess(): boolean {
  return !!getAdminSecret();
}

// Exported as getAdminHeaders (used by components importing from @/lib/adminAuth)
// and as getAuthHeaders (used by components importing from @/lib/queryClient)
export function getAdminHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const adminSecret = getAdminSecret();
  if (adminSecret) headers['X-Admin-Secret'] = adminSecret;
  return headers;
}
export const getAuthHeaders = getAdminHeaders;

// Stubs for Memberstack functions (not used in admin, but shared components may import them)
export function getMemberstackId(): string | null { return null; }
export function hasMemberstackId(): boolean { return false; }

// Build WebSocket URL using the API base host for cross-domain support
export function buildAuthenticatedWsUrl(path: string): string {
  const apiHost = API_BASE ? new URL(API_BASE).host : window.location.host;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = new URL(`${protocol}//${apiHost}${path}`);
  const adminSecret = getAdminSecret();
  if (adminSecret) {
    url.searchParams.set('admin_secret', adminSecret);
  }
  return url.toString();
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

  // Always include admin secret
  const adminSecret = getAdminSecret();
  if (adminSecret) {
    headers['X-Admin-Secret'] = adminSecret;
  }

  // Prefix with API base if the URL is a relative path
  const fullUrl = url.startsWith('http') ? url : `${API_BASE}${url}`;

  const res = await fetch(fullUrl, {
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

    // Always include admin secret
    const adminSecret = getAdminSecret();
    if (adminSecret) {
      headers['X-Admin-Secret'] = adminSecret;
    }

    // Prefix with API base if the URL is a relative path
    const fullUrl = url.startsWith('http') ? url : `${API_BASE}${url}`;

    const res = await fetch(fullUrl, {
      credentials: "include",
      headers,
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

// Export as `queryClient` so components importing { queryClient } from "@/lib/queryClient"
// work when Vite aliases @/lib/queryClient -> @/lib/adminQueryClient
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
