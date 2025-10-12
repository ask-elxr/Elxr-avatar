import { useQuery } from "@tanstack/react-query";
import type { User } from "@shared/schema";

export function useAuth() {
  const { data: user, isLoading, error } = useQuery<User | null>({
    queryKey: ["/api/auth/user"],
    retry: false,
    // Return null on error instead of throwing
    throwOnError: false,
  });

  // If there's a 401 error, user is not authenticated
  const isAuthError = error && error.message?.includes('401');
  
  return {
    user: isAuthError ? null : user,
    isLoading,
    isAuthenticated: !!user && !isAuthError,
  };
}