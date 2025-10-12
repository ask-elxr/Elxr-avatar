import { useState, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";

export function useAnonymousUser() {
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if user already has an ID
    let storedUserId = localStorage.getItem('anonymous-user-id');
    
    if (!storedUserId) {
      // Generate new anonymous user ID
      storedUserId = `anon-${uuidv4()}`;
      localStorage.setItem('anonymous-user-id', storedUserId);
    }
    
    setUserId(storedUserId);
    setIsLoading(false);
  }, []);

  return {
    userId,
    isLoading,
  };
}
