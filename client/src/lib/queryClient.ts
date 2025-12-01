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

// Check if admin secret is configured
export function hasAdminAccess(): boolean {
  return !!getAdminSecret();
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
  
  // Add admin secret header for admin routes
  if (url.includes('/api/admin') || url.includes('/api/pinecone') || url.includes('/api/documents') || url.includes('/api/knowledge')) {
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
    
    // Add admin secret header for admin routes
    if (url.includes('/api/admin') || url.includes('/api/pinecone') || url.includes('/api/documents') || url.includes('/api/knowledge')) {
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
