import { useQuery } from "@tanstack/react-query";
import type { User } from "@shared/schema";

export function useAuth() {
  const { data: user, isLoading, error } = useQuery<User | null>({
    queryKey: ["/api/auth/user"],
    retry: false,
    throwOnError: false,
  });

  const isAuthError = error && error.message?.includes('401');
  const currentUser = isAuthError ? null : user;
  
  return {
    user: currentUser,
    isLoading,
    isAuthenticated: !!currentUser,
    isAdmin: currentUser?.role === 'admin',
  };
}