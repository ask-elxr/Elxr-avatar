import { useQuery } from "@tanstack/react-query";
import type { User } from "@shared/schema";

// Embedded mode: Authentication is handled by Webflow externally
// This hook provides a mock authenticated state for the embedded app
export function useAuth() {
  const { data: user, isLoading, error } = useQuery<User | null>({
    queryKey: ["/api/auth/user"],
    retry: false,
    throwOnError: false,
  });

  // In embedded mode, treat all users as authenticated guests
  // The backend handles session creation automatically
  const isAuthError = error && error.message?.includes('401');
  
  // Create a mock user for embedded mode if no user data
  const embeddedUser: User | null = user ?? (isAuthError ? null : {
    id: 'embedded-user',
    email: null,
    firstName: 'Guest',
    lastName: 'User',
    profileImageUrl: null,
    role: 'user',
    createdAt: new Date(),
  });
  
  return {
    user: embeddedUser,
    isLoading,
    isAuthenticated: true, // Always authenticated in embedded mode
    isAdmin: user?.role === 'admin', // Only actual admins get admin access
    isEmbedded: true, // Flag to indicate embedded mode
  };
}