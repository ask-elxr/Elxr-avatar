import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { X, Trash2, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";

interface MemoryRecord {
  id: string;
  content: string;
  type: 'summary' | 'note' | 'preference';
  userId: string;
  metadata: Record<string, any>;
  score: number;
  createdAt: number;
}

interface MemoryViewerProps {
  userId: string;
  onClose: () => void;
}

export function MemoryViewer({ userId, onClose }: MemoryViewerProps) {
  const [filterType, setFilterType] = useState<'all' | 'summary' | 'note' | 'preference'>('all');
  const { toast } = useToast();

  // Fetch all memories
  const { data, isLoading, refetch } = useQuery<{ success: boolean; memories: MemoryRecord[]; count: number }>({
    queryKey: ['/api/memory/all', userId, filterType],
    queryFn: async () => {
      const params = new URLSearchParams({ userId });
      if (filterType !== 'all') {
        params.append('type', filterType);
      }
      const response = await fetch(`/api/memory/all?${params}`);
      if (!response.ok) throw new Error('Failed to fetch memories');
      return response.json();
    },
  });

  // Delete memory mutation
  const deleteMutation = useMutation({
    mutationFn: async (memoryId: string) => {
      // Backend gets userId from authenticated session for security
      const response = await fetch(`/api/memory/${memoryId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }), // For temp_ IDs; session userId used otherwise
      });
      if (!response.ok) throw new Error('Failed to delete memory');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/memory/all'] });
      toast({
        title: "Memory Deleted",
        description: "The memory has been removed successfully.",
      });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Delete Failed",
        description: "Failed to delete memory. Please try again.",
      });
    },
  });

  // Delete all memories mutation
  const deleteAllMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/memory/all/${userId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) throw new Error('Failed to delete all memories');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/memory/all'] });
      toast({
        title: "All Memories Deleted",
        description: "All your memories have been removed.",
      });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Delete Failed",
        description: "Failed to delete all memories. Please try again.",
      });
    },
  });

  const memories = data?.memories || [];
  const memoryCount = data?.count || 0;

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'summary':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      case 'note':
        return 'bg-green-500/20 text-green-300 border-green-500/30';
      case 'preference':
        return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
      default:
        return 'bg-gray-500/20 text-gray-300 border-gray-500/30';
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 md:p-6 border-b border-gray-700">
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-white">Your Memories</h2>
            <p className="text-sm text-gray-400 mt-1">{memoryCount} memories stored</p>
          </div>
          <Button
            onClick={onClose}
            variant="ghost"
            size="icon"
            className="text-gray-400 hover:text-white"
            data-testid="button-close-memory-viewer"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 p-4 border-b border-gray-700 overflow-x-auto">
          {['all', 'summary', 'note', 'preference'].map((type) => (
            <Button
              key={type}
              onClick={() => setFilterType(type as any)}
              variant={filterType === type ? 'default' : 'outline'}
              size="sm"
              className={`capitalize ${
                filterType === type
                  ? 'bg-purple-600 hover:bg-purple-700 text-white'
                  : 'text-gray-300 hover:text-white border-gray-600'
              }`}
              data-testid={`button-filter-${type}`}
            >
              {type}
            </Button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-6 h-6 text-gray-400 animate-spin" />
              <span className="ml-2 text-gray-400">Loading memories...</span>
            </div>
          ) : memories.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-400 text-lg">No memories found</p>
              <p className="text-gray-500 text-sm mt-2">
                {filterType === 'all'
                  ? 'Start chatting with memory enabled to build your history'
                  : `No ${filterType} memories yet`}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {memories.map((memory) => (
                <div
                  key={memory.id}
                  className="bg-gray-800 border border-gray-700 rounded-lg p-4 hover:border-gray-600 transition-colors"
                  data-testid={`memory-${memory.id}`}
                >
                  {/* Memory Header */}
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium border ${getTypeColor(
                          memory.type,
                        )}`}
                      >
                        {memory.type}
                      </span>
                      {memory.metadata?.avatarId && (
                        <span className="px-2 py-1 rounded text-xs bg-gray-700 text-gray-300">
                          {memory.metadata.avatarId}
                        </span>
                      )}
                      <span className="text-xs text-gray-500">
                        {format(new Date(memory.createdAt), 'MMM d, yyyy h:mm a')}
                      </span>
                    </div>
                    <Button
                      onClick={() => deleteMutation.mutate(memory.id)}
                      variant="ghost"
                      size="sm"
                      className="text-gray-400 hover:text-red-400 h-8 px-2"
                      disabled={deleteMutation.isPending}
                      data-testid={`button-delete-${memory.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>

                  {/* Memory Content */}
                  <p className="text-gray-200 text-sm leading-relaxed whitespace-pre-wrap">
                    {memory.content}
                  </p>

                  {/* Additional Metadata */}
                  {memory.metadata?.messageCount && (
                    <p className="text-xs text-gray-500 mt-2">
                      Based on {memory.metadata.messageCount} messages
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {memoryCount > 0 && (
          <div className="p-4 border-t border-gray-700 flex items-center justify-between">
            <Button
              onClick={() => refetch()}
              variant="outline"
              size="sm"
              className="text-gray-300 border-gray-600 hover:text-white"
              data-testid="button-refresh-memories"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
            <Button
              onClick={() => {
                if (confirm('Are you sure you want to delete all memories? This cannot be undone.')) {
                  deleteAllMutation.mutate();
                }
              }}
              variant="destructive"
              size="sm"
              disabled={deleteAllMutation.isPending}
              data-testid="button-delete-all-memories"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete All
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
