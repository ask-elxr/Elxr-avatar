import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Plus, RefreshCw, Trash2, Settings, Database } from "lucide-react";

interface KnowledgeSource {
  id: string;
  type: string;
  name: string;
  pineconeNamespace: string;
  status: string;
  lastSyncAt: string | null;
  syncError: string | null;
  itemsCount: number;
  config: any;
}

export function KnowledgeSourceManager() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isConfigDialogOpen, setIsConfigDialogOpen] = useState(false);
  const [selectedSource, setSelectedSource] = useState<KnowledgeSource | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    type: "notion",
    notionDatabaseId: "",
  });
  const { toast } = useToast();

  const { data: sourcesData, isLoading } = useQuery<{ sources: KnowledgeSource[] }>({
    queryKey: ["/api/knowledge-sources"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("/api/knowledge-sources", "POST", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge-sources"] });
      setIsCreateDialogOpen(false);
      setFormData({ name: "", type: "notion", notionDatabaseId: "" });
      toast({
        title: "Knowledge source created",
        description: "Your knowledge base connection has been created successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Creation failed",
        description: error.message || "Failed to create knowledge source",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/knowledge-sources/${id}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge-sources"] });
      toast({
        title: "Knowledge source deleted",
        description: "The knowledge base connection has been removed.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Deletion failed",
        description: error.message || "Failed to delete knowledge source",
        variant: "destructive",
      });
    },
  });

  const syncMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/knowledge-sources/${id}/sync`, "POST");
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge-sources"] });
      toast({
        title: "Sync completed",
        description: `Successfully synced ${data.itemsCount} items.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Sync failed",
        description: error.message || "Failed to sync knowledge source",
        variant: "destructive",
      });
    },
  });

  const updateConfigMutation = useMutation({
    mutationFn: async ({ id, config }: { id: string; config: any }) => {
      return await apiRequest(`/api/knowledge-sources/${id}`, "PUT", { config });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge-sources"] });
      setIsConfigDialogOpen(false);
      setSelectedSource(null);
      toast({
        title: "Configuration updated",
        description: "Knowledge source settings have been saved.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Update failed",
        description: error.message || "Failed to update configuration",
        variant: "destructive",
      });
    },
  });

  const handleCreate = () => {
    const config: any = {};
    
    if (formData.type === "notion" && formData.notionDatabaseId) {
      config.databaseId = formData.notionDatabaseId;
    }

    createMutation.mutate({
      name: formData.name,
      type: formData.type,
      config,
    });
  };

  const handleSync = (id: string) => {
    syncMutation.mutate(id);
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this knowledge source?")) {
      deleteMutation.mutate(id);
    }
  };

  const handleConfigSave = () => {
    if (!selectedSource) return;
    
    const config: any = {};
    if (selectedSource.type === "notion") {
      const databaseIdInput = document.getElementById("notion-database-id") as HTMLInputElement;
      config.databaseId = databaseIdInput.value;
    }

    updateConfigMutation.mutate({
      id: selectedSource.id,
      config,
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge variant="outline" className="bg-green-500/10 text-green-500">Active</Badge>;
      case "syncing":
        return <Badge variant="outline" className="bg-blue-500/10 text-blue-500">Syncing</Badge>;
      case "error":
        return <Badge variant="outline" className="bg-red-500/10 text-red-500">Error</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getTypeDisplay = (type: string) => {
    switch (type) {
      case "notion":
        return "Notion";
      case "obsidian":
        return "Obsidian";
      case "manual":
        return "Manual Upload";
      default:
        return type;
    }
  };

  if (isLoading) {
    return <div className="text-center py-8">Loading knowledge sources...</div>;
  }

  const sources = sourcesData?.sources || [];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <p className="text-sm text-muted-foreground">
            Connect your personal knowledge bases like Notion or Obsidian to enhance avatar responses.
          </p>
        </div>
        <Button
          onClick={() => setIsCreateDialogOpen(true)}
          size="sm"
          data-testid="button-create-knowledge-source"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Knowledge Source
        </Button>
      </div>

      {sources.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-muted/50">
          <Database className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No knowledge sources connected yet.</p>
          <Button
            onClick={() => setIsCreateDialogOpen(true)}
            variant="outline"
            className="mt-4"
            data-testid="button-add-first-source"
          >
            Add Your First Source
          </Button>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Items</TableHead>
              <TableHead>Last Synced</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sources.map((source) => (
              <TableRow key={source.id} data-testid={`source-row-${source.id}`}>
                <TableCell className="font-medium">{source.name}</TableCell>
                <TableCell>{getTypeDisplay(source.type)}</TableCell>
                <TableCell>{getStatusBadge(source.status)}</TableCell>
                <TableCell>{source.itemsCount}</TableCell>
                <TableCell>
                  {source.lastSyncAt
                    ? new Date(source.lastSyncAt).toLocaleDateString()
                    : "Never"}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedSource(source);
                        setIsConfigDialogOpen(true);
                      }}
                      data-testid={`button-config-${source.id}`}
                    >
                      <Settings className="w-4 h-4" />
                    </Button>
                    {source.type === "notion" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSync(source.id)}
                        disabled={syncMutation.isPending}
                        data-testid={`button-sync-${source.id}`}
                      >
                        <RefreshCw className="w-4 h-4" />
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(source.id)}
                      disabled={deleteMutation.isPending}
                      data-testid={`button-delete-${source.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Knowledge Source</DialogTitle>
            <DialogDescription>
              Connect a personal knowledge base to enhance your avatar's responses.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="source-name">Name</Label>
              <Input
                id="source-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="My Notion Workspace"
                data-testid="input-source-name"
              />
            </div>
            <div>
              <Label htmlFor="source-type">Type</Label>
              <Select
                value={formData.type}
                onValueChange={(value) => setFormData({ ...formData, type: value })}
              >
                <SelectTrigger id="source-type" data-testid="select-source-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="notion">Notion</SelectItem>
                  <SelectItem value="obsidian">Obsidian</SelectItem>
                  <SelectItem value="manual">Manual Upload</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {formData.type === "notion" && (
              <div>
                <Label htmlFor="notion-database-id">Notion Database ID</Label>
                <Input
                  id="notion-database-id"
                  value={formData.notionDatabaseId}
                  onChange={(e) => setFormData({ ...formData, notionDatabaseId: e.target.value })}
                  placeholder="abc123def456..."
                  data-testid="input-notion-database-id"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Find this in your Notion database URL
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!formData.name || createMutation.isPending}
              data-testid="button-submit-create"
            >
              Create Source
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Config Dialog */}
      <Dialog open={isConfigDialogOpen} onOpenChange={setIsConfigDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configure Knowledge Source</DialogTitle>
            <DialogDescription>
              Update settings for {selectedSource?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {selectedSource?.type === "notion" && (
              <div>
                <Label htmlFor="notion-database-id">Notion Database ID</Label>
                <Input
                  id="notion-database-id"
                  defaultValue={selectedSource?.config?.databaseId || ""}
                  placeholder="abc123def456..."
                  data-testid="input-config-notion-database-id"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsConfigDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleConfigSave}
              disabled={updateConfigMutation.isPending}
              data-testid="button-submit-config"
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
