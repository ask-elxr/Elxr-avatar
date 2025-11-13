import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Pencil, Trash2, Plus, X } from "lucide-react";
import type { AvatarProfile, InsertAvatarProfile } from "@shared/schema";

export function AvatarManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAvatar, setEditingAvatar] = useState<AvatarProfile | null>(null);
  const [namespaceInput, setNamespaceInput] = useState("");

  // Form state
  const [formData, setFormData] = useState<InsertAvatarProfile>({
    id: "",
    name: "",
    description: "",
    heygenAvatarId: null,
    heygenVoiceId: null,
    heygenKnowledgeId: null,
    elevenlabsVoiceId: null,
    voiceRate: "1.0",
    personalityPrompt: "",
    pineconeNamespaces: [],
    isActive: true,
  });

  // Fetch all avatars
  const { data: avatars, isLoading } = useQuery<AvatarProfile[]>({
    queryKey: ["/api/admin/avatars"],
  });

  // Create avatar mutation
  const createMutation = useMutation({
    mutationFn: async (data: InsertAvatarProfile) => {
      return await apiRequest("POST", "/api/admin/avatars", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/avatars"] });
      toast({
        title: "Avatar created",
        description: "The avatar has been created successfully.",
      });
      handleCloseDialog();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create avatar",
        description: error.message || "An error occurred.",
        variant: "destructive",
      });
    },
  });

  // Update avatar mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InsertAvatarProfile> }) => {
      return await apiRequest("PUT", `/api/admin/avatars/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/avatars"] });
      toast({
        title: "Avatar updated",
        description: "The avatar has been updated successfully.",
      });
      handleCloseDialog();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update avatar",
        description: error.message || "An error occurred.",
        variant: "destructive",
      });
    },
  });

  // Delete avatar mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/admin/avatars/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/avatars"] });
      toast({
        title: "Avatar deleted",
        description: "The avatar has been deactivated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete avatar",
        description: error.message || "An error occurred.",
        variant: "destructive",
      });
    },
  });

  const handleOpenCreateDialog = () => {
    setEditingAvatar(null);
    setFormData({
      id: "",
      name: "",
      description: "",
      heygenAvatarId: null,
      heygenVoiceId: null,
      heygenKnowledgeId: null,
      elevenlabsVoiceId: null,
      voiceRate: "1.0",
      personalityPrompt: "",
      pineconeNamespaces: [],
      isActive: true,
    });
    setIsDialogOpen(true);
  };

  const handleOpenEditDialog = (avatar: AvatarProfile) => {
    setEditingAvatar(avatar);
    setFormData({
      id: avatar.id,
      name: avatar.name,
      description: avatar.description,
      heygenAvatarId: avatar.heygenAvatarId,
      heygenVoiceId: avatar.heygenVoiceId,
      heygenKnowledgeId: avatar.heygenKnowledgeId,
      elevenlabsVoiceId: avatar.elevenlabsVoiceId,
      voiceRate: avatar.voiceRate || "1.0",
      personalityPrompt: avatar.personalityPrompt,
      pineconeNamespaces: avatar.pineconeNamespaces,
      isActive: avatar.isActive,
    });
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingAvatar(null);
    setNamespaceInput("");
  };

  const handleAddNamespace = () => {
    if (namespaceInput.trim() && !formData.pineconeNamespaces?.includes(namespaceInput.trim())) {
      setFormData({
        ...formData,
        pineconeNamespaces: [...(formData.pineconeNamespaces || []), namespaceInput.trim()],
      });
      setNamespaceInput("");
    }
  };

  const handleRemoveNamespace = (namespace: string) => {
    setFormData({
      ...formData,
      pineconeNamespaces: (formData.pineconeNamespaces || []).filter((ns) => ns !== namespace),
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!formData.id.trim() || !formData.name.trim() || !formData.description.trim() || !formData.personalityPrompt.trim()) {
      toast({
        title: "Validation error",
        description: "Please fill in all required fields (ID, Name, Description, Personality Prompt).",
        variant: "destructive",
      });
      return;
    }

    if (formData.isActive && (!formData.pineconeNamespaces || formData.pineconeNamespaces.length === 0)) {
      toast({
        title: "Validation error",
        description: "Active avatars must have at least one Pinecone namespace.",
        variant: "destructive",
      });
      return;
    }

    // Clean data - trim all text fields and convert empty strings to null for optional fields
    const cleanedData = {
      ...formData,
      id: formData.id.trim(),
      name: formData.name.trim(),
      description: formData.description.trim(),
      personalityPrompt: formData.personalityPrompt.trim(),
      heygenAvatarId: formData.heygenAvatarId?.trim() || null,
      heygenVoiceId: formData.heygenVoiceId?.trim() || null,
      heygenKnowledgeId: formData.heygenKnowledgeId?.trim() || null,
      elevenlabsVoiceId: formData.elevenlabsVoiceId?.trim() || null,
      voiceRate: formData.voiceRate?.trim() || null,
    };

    if (editingAvatar) {
      const { id, ...updateData } = cleanedData;
      updateMutation.mutate({ id: editingAvatar.id, data: updateData });
    } else {
      createMutation.mutate(cleanedData);
    }
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to deactivate this avatar?")) {
      deleteMutation.mutate(id);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium">Manage Avatars</h3>
          <p className="text-sm text-muted-foreground">
            Create and manage AI avatar personalities
          </p>
        </div>
        <Button onClick={handleOpenCreateDialog} data-testid="button-create-avatar">
          <Plus className="w-4 h-4 mr-2" />
          Create Avatar
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" data-testid="loading-spinner"></div>
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {avatars?.map((avatar) => (
                <TableRow key={avatar.id}>
                  <TableCell className="font-medium">{avatar.name}</TableCell>
                  <TableCell className="max-w-md truncate">{avatar.description}</TableCell>
                  <TableCell>
                    <Badge variant={avatar.isActive ? "default" : "secondary"}>
                      {avatar.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenEditDialog(avatar)}
                        data-testid={`button-edit-${avatar.id}`}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(avatar.id)}
                        disabled={deleteMutation.isPending}
                        data-testid={`button-delete-${avatar.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingAvatar ? "Edit Avatar" : "Create Avatar"}</DialogTitle>
            <DialogDescription>
              {editingAvatar
                ? "Update the avatar configuration and personality."
                : "Create a new AI avatar with a unique personality."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="id">Avatar ID *</Label>
                <Input
                  id="id"
                  value={formData.id}
                  onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                  placeholder="e.g., wellness-coach"
                  disabled={!!editingAvatar}
                  required
                  data-testid="input-avatar-id"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Dr. Sarah Chen"
                  required
                  data-testid="input-avatar-name"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description *</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description of the avatar's expertise"
                rows={2}
                required
                data-testid="input-avatar-description"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="heygenAvatarId">HeyGen Avatar ID</Label>
                <Input
                  id="heygenAvatarId"
                  value={formData.heygenAvatarId || ""}
                  onChange={(e) => setFormData({ ...formData, heygenAvatarId: e.target.value || null })}
                  placeholder="Optional"
                  data-testid="input-heygen-avatar-id"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="heygenVoiceId">HeyGen Voice ID</Label>
                <Input
                  id="heygenVoiceId"
                  value={formData.heygenVoiceId || ""}
                  onChange={(e) => setFormData({ ...formData, heygenVoiceId: e.target.value || null })}
                  placeholder="Optional"
                  data-testid="input-heygen-voice-id"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="elevenlabsVoiceId">ElevenLabs Voice ID</Label>
                <Input
                  id="elevenlabsVoiceId"
                  value={formData.elevenlabsVoiceId || ""}
                  onChange={(e) => setFormData({ ...formData, elevenlabsVoiceId: e.target.value || null })}
                  placeholder="Optional"
                  data-testid="input-elevenlabs-voice-id"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="voiceRate">Voice Rate</Label>
                <Input
                  id="voiceRate"
                  value={formData.voiceRate || ""}
                  onChange={(e) => setFormData({ ...formData, voiceRate: e.target.value || null })}
                  placeholder="1.0"
                  data-testid="input-voice-rate"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="personalityPrompt">Personality Prompt *</Label>
              <Textarea
                id="personalityPrompt"
                value={formData.personalityPrompt}
                onChange={(e) => setFormData({ ...formData, personalityPrompt: e.target.value })}
                placeholder="System prompt that defines the avatar's personality and behavior"
                rows={8}
                required
                data-testid="input-personality-prompt"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="namespace">Pinecone Namespaces</Label>
              <div className="flex gap-2">
                <Input
                  id="namespace"
                  value={namespaceInput}
                  onChange={(e) => setNamespaceInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddNamespace())}
                  placeholder="e.g., mark-kohl"
                  data-testid="input-namespace"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleAddNamespace}
                  data-testid="button-add-namespace"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {(formData.pineconeNamespaces || []).map((ns) => (
                  <Badge key={ns} variant="secondary" className="flex items-center gap-1">
                    {ns}
                    <button
                      type="button"
                      onClick={() => handleRemoveNamespace(ns)}
                      className="ml-1 hover:text-destructive"
                      data-testid={`button-remove-namespace-${ns}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="isActive"
                checked={formData.isActive}
                onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                data-testid="switch-is-active"
              />
              <Label htmlFor="isActive">Active</Label>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleCloseDialog}
                disabled={isPending}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending} data-testid="button-save">
                {isPending ? (
                  <>
                    <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Avatar"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
