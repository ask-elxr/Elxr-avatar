import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Database,
  Trash2,
  Eye,
  RefreshCw,
  ChevronRight,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Search,
  Edit,
  Save,
  X,
  Loader2,
} from "lucide-react";

interface NamespaceStats {
  namespace: string;
  vectorCount: number;
}

interface Vector {
  id: string;
  metadata?: Record<string, any>;
  text?: string;
}

interface VectorListResponse {
  vectors: Vector[];
  nextToken?: string;
  namespace: string;
}

interface NamespaceResponse {
  totalVectorCount: number;
  dimension: number;
  namespaces: NamespaceStats[];
}

export function PineconeNamespaceManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedNamespace, setSelectedNamespace] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedVectors, setSelectedVectors] = useState<Set<string>>(new Set());
  const [deleteNamespaceConfirm, setDeleteNamespaceConfirm] = useState<string | null>(null);
  const [deleteVectorsConfirm, setDeleteVectorsConfirm] = useState(false);
  const [editingVector, setEditingVector] = useState<Vector | null>(null);
  const [editedMetadata, setEditedMetadata] = useState<string>("");

  const { data: namespaceStats, isLoading: statsLoading, refetch: refetchStats } = useQuery<NamespaceResponse>({
    queryKey: ["/api/admin/pinecone/namespaces"],
  });

  const { data: vectorData, isLoading: vectorsLoading, refetch: refetchVectors } = useQuery<VectorListResponse>({
    queryKey: [`/api/admin/pinecone/namespace/${selectedNamespace}/vectors`],
    enabled: !!selectedNamespace,
  });

  const deleteVectorsMutation = useMutation({
    mutationFn: async ({ namespace, ids }: { namespace: string; ids: string[] }) => {
      return apiRequest(`/api/admin/pinecone/namespace/${namespace}/delete-vectors`, "POST", { ids });
    },
    onSuccess: () => {
      toast({
        title: "Vectors deleted",
        description: `Successfully deleted ${selectedVectors.size} vectors`,
      });
      setSelectedVectors(new Set());
      refetchVectors();
      refetchStats();
    },
    onError: (error: Error) => {
      toast({
        title: "Delete failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteNamespaceMutation = useMutation({
    mutationFn: async (namespace: string) => {
      return apiRequest(`/api/admin/pinecone/namespace/${namespace}?confirm=true`, "DELETE");
    },
    onSuccess: () => {
      toast({
        title: "Namespace deleted",
        description: "All vectors in the namespace have been deleted",
      });
      setSelectedNamespace(null);
      refetchStats();
    },
    onError: (error: Error) => {
      toast({
        title: "Delete failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateVectorMutation = useMutation({
    mutationFn: async ({ namespace, id, metadata }: { namespace: string; id: string; metadata: Record<string, any> }) => {
      return apiRequest(`/api/admin/pinecone/namespace/${namespace}/vector/${id}`, "PUT", { metadata });
    },
    onSuccess: () => {
      toast({
        title: "Vector updated",
        description: "Metadata has been updated successfully",
      });
      setEditingVector(null);
      refetchVectors();
    },
    onError: (error: Error) => {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const filteredNamespaces = namespaceStats?.namespaces?.filter(ns =>
    ns.namespace.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const toggleVectorSelection = (id: string) => {
    const newSelected = new Set(selectedVectors);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedVectors(newSelected);
  };

  const toggleSelectAll = () => {
    if (vectorData?.vectors) {
      if (selectedVectors.size === vectorData.vectors.length) {
        setSelectedVectors(new Set());
      } else {
        setSelectedVectors(new Set(vectorData.vectors.map(v => v.id)));
      }
    }
  };

  const handleEditVector = (vector: Vector) => {
    setEditingVector(vector);
    setEditedMetadata(JSON.stringify(vector.metadata || {}, null, 2));
  };

  const handleSaveMetadata = () => {
    if (!editingVector || !selectedNamespace) return;
    
    try {
      const metadata = JSON.parse(editedMetadata);
      updateVectorMutation.mutate({
        namespace: selectedNamespace,
        id: editingVector.id,
        metadata,
      });
    } catch (e) {
      toast({
        title: "Invalid JSON",
        description: "Please enter valid JSON for metadata",
        variant: "destructive",
      });
    }
  };

  const handleDeleteSelected = () => {
    if (!selectedNamespace || selectedVectors.size === 0) return;
    deleteVectorsMutation.mutate({
      namespace: selectedNamespace,
      ids: Array.from(selectedVectors),
    });
    setDeleteVectorsConfirm(false);
  };

  const handleDeleteNamespace = () => {
    if (!deleteNamespaceConfirm) return;
    deleteNamespaceMutation.mutate(deleteNamespaceConfirm);
    setDeleteNamespaceConfirm(null);
  };

  if (statsLoading) {
    return (
      <Card className="glass-strong border-white/10">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
          <span className="ml-3 text-white/70">Loading namespace statistics...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="glass-strong border-white/10">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-white flex items-center gap-2">
                <Database className="w-5 h-5 text-purple-400" />
                Pinecone Namespaces
              </CardTitle>
              <CardDescription className="text-white/60">
                Total: {namespaceStats?.totalVectorCount?.toLocaleString() || 0} vectors across {namespaceStats?.namespaces?.length || 0} namespaces
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetchStats()}
              className="border-white/20 text-white hover:bg-white/10"
              data-testid="btn-refresh-namespaces"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50" />
            <Input
              placeholder="Search namespaces..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-white/5 border-white/20 text-white placeholder:text-white/50"
              data-testid="input-search-namespaces"
            />
          </div>

          <ScrollArea className="h-[300px]">
            <div className="space-y-2">
              {filteredNamespaces.map((ns) => (
                <div
                  key={ns.namespace}
                  className={`flex items-center justify-between p-3 rounded-lg transition-all cursor-pointer ${
                    selectedNamespace === ns.namespace
                      ? "bg-purple-500/20 border border-purple-500/50"
                      : "bg-white/5 hover:bg-white/10 border border-transparent"
                  }`}
                  onClick={() => {
                    setSelectedNamespace(ns.namespace);
                    setSelectedVectors(new Set());
                  }}
                  data-testid={`namespace-item-${ns.namespace}`}
                >
                  <div className="flex items-center gap-3">
                    <Database className="w-4 h-4 text-purple-400" />
                    <span className="text-white font-medium">{ns.namespace}</span>
                    <Badge variant="secondary" className="bg-white/10 text-white/70">
                      {ns.vectorCount.toLocaleString()} vectors
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-white/70 hover:text-red-400 hover:bg-red-500/10"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteNamespaceConfirm(ns.namespace);
                      }}
                      data-testid={`btn-delete-namespace-${ns.namespace}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                    <ChevronRight className={`w-4 h-4 text-white/50 transition-transform ${
                      selectedNamespace === ns.namespace ? "rotate-90" : ""
                    }`} />
                  </div>
                </div>
              ))}
              {filteredNamespaces.length === 0 && (
                <div className="text-center py-8 text-white/50">
                  {searchQuery ? "No namespaces match your search" : "No namespaces found"}
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {selectedNamespace && (
        <Card className="glass-strong border-purple-500/30">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-white flex items-center gap-2">
                  <Eye className="w-5 h-5 text-cyan-400" />
                  Vectors in "{selectedNamespace}"
                </CardTitle>
                <CardDescription className="text-white/60">
                  {vectorData?.vectors?.length || 0} vectors loaded
                  {vectorData?.nextToken && " (more available)"}
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetchVectors()}
                  disabled={vectorsLoading}
                  className="border-white/20 text-white hover:bg-white/10"
                  data-testid="btn-refresh-vectors"
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${vectorsLoading ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
                {selectedVectors.size > 0 && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setDeleteVectorsConfirm(true)}
                    className="bg-red-500/80 hover:bg-red-600"
                    data-testid="btn-delete-selected"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete {selectedVectors.size} Selected
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {vectorsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
                <span className="ml-3 text-white/70">Loading vectors...</span>
              </div>
            ) : vectorData?.vectors && vectorData.vectors.length > 0 ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3 pb-2 border-b border-white/10">
                  <Checkbox
                    checked={selectedVectors.size === vectorData.vectors.length && vectorData.vectors.length > 0}
                    onCheckedChange={toggleSelectAll}
                    className="border-white/30 data-[state=checked]:bg-purple-500"
                    data-testid="checkbox-select-all"
                  />
                  <span className="text-sm text-white/70">Select All</span>
                </div>
                <ScrollArea className="h-[400px]">
                  <div className="space-y-2">
                    {vectorData.vectors.map((vector) => (
                      <div
                        key={vector.id}
                        className={`p-3 rounded-lg bg-white/5 border transition-all ${
                          selectedVectors.has(vector.id) ? "border-purple-500/50" : "border-transparent"
                        }`}
                        data-testid={`vector-item-${vector.id}`}
                      >
                        <div className="flex items-start gap-3">
                          <Checkbox
                            checked={selectedVectors.has(vector.id)}
                            onCheckedChange={() => toggleVectorSelection(vector.id)}
                            className="mt-1 border-white/30 data-[state=checked]:bg-purple-500"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-2">
                              <code className="text-xs text-cyan-400 font-mono truncate">{vector.id}</code>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEditVector(vector)}
                                className="text-white/50 hover:text-white hover:bg-white/10"
                                data-testid={`btn-edit-vector-${vector.id}`}
                              >
                                <Edit className="w-3 h-3" />
                              </Button>
                            </div>
                            {vector.text && (
                              <p className="text-sm text-white/70 line-clamp-2">{vector.text}</p>
                            )}
                            {vector.metadata && Object.keys(vector.metadata).length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {Object.entries(vector.metadata)
                                  .filter(([key]) => key !== 'text')
                                  .slice(0, 5)
                                  .map(([key, value]) => (
                                    <Badge key={key} variant="outline" className="text-xs border-white/20 text-white/60">
                                      {key}: {typeof value === 'string' ? value.substring(0, 20) : String(value)}
                                    </Badge>
                                  ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            ) : (
              <div className="text-center py-8 text-white/50">
                No vectors found in this namespace
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <AlertDialog open={!!deleteNamespaceConfirm} onOpenChange={() => setDeleteNamespaceConfirm(null)}>
        <AlertDialogContent className="bg-gray-900 border-red-500/30">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              Delete Entire Namespace?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-white/70">
              This will permanently delete <strong className="text-red-400">{deleteNamespaceConfirm}</strong> and all 
              its vectors. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white/10 text-white border-white/20 hover:bg-white/20">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteNamespace}
              className="bg-red-500 hover:bg-red-600 text-white"
              data-testid="btn-confirm-delete-namespace"
            >
              {deleteNamespaceMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              Delete Namespace
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteVectorsConfirm} onOpenChange={setDeleteVectorsConfirm}>
        <AlertDialogContent className="bg-gray-900 border-red-500/30">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              Delete Selected Vectors?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-white/70">
              This will permanently delete <strong className="text-red-400">{selectedVectors.size}</strong> vectors 
              from the namespace. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white/10 text-white border-white/20 hover:bg-white/20">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSelected}
              className="bg-red-500 hover:bg-red-600 text-white"
              data-testid="btn-confirm-delete-vectors"
            >
              {deleteVectorsMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              Delete Vectors
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!editingVector} onOpenChange={() => setEditingVector(null)}>
        <DialogContent className="bg-gray-900 border-white/20 max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-white">Edit Vector Metadata</DialogTitle>
            <DialogDescription className="text-white/60">
              Vector ID: <code className="text-cyan-400">{editingVector?.id}</code>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-white/70 mb-2 block">Metadata (JSON)</label>
              <textarea
                value={editedMetadata}
                onChange={(e) => setEditedMetadata(e.target.value)}
                className="w-full h-64 bg-black/50 border border-white/20 rounded-lg p-4 text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                data-testid="textarea-edit-metadata"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingVector(null)}
              className="border-white/20 text-white hover:bg-white/10"
            >
              <X className="w-4 h-4 mr-2" />
              Cancel
            </Button>
            <Button
              onClick={handleSaveMetadata}
              disabled={updateVectorMutation.isPending}
              className="bg-purple-500 hover:bg-purple-600 text-white"
              data-testid="btn-save-metadata"
            >
              {updateVectorMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
