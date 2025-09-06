import { useState } from 'react';
import { apiRequest } from '@/lib/queryClient';

interface KnowledgeResponse {
  success: boolean;
  message: string;
  knowledgeResponse: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export function useKnowledgeBase() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getAvatarResponse = async (message: string, conversationHistory: any[] = []): Promise<string> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await apiRequest('/api/avatar/response', {
        method: 'POST',
        body: JSON.stringify({ message, conversationHistory }),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data: KnowledgeResponse = await response.json();
      
      if (data.success && data.knowledgeResponse) {
        return data.knowledgeResponse;
      } else {
        throw new Error('No knowledge response received');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to get knowledge response';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return {
    getAvatarResponse,
    isLoading,
    error
  };
}