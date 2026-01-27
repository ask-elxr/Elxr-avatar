import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
import { Pencil, Trash2, Plus, X, Video, Brain, RefreshCw, Eye, Edit2, Sparkles, Upload, Film } from "lucide-react";
import type { AvatarProfile, InsertAvatarProfile } from "@shared/schema";
import { PINECONE_CATEGORIES } from "@shared/pineconeCategories";
import { useLocation } from "wouter";
import { MarqueeText } from "@/components/MarqueeText";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface PersonaSpec {
  id: string;
  displayName: string;
  oneLiner: string;
  role: string;
  audience: string[];
  boundaries: {
    notA: string[];
    refuseTopics: string[];
  };
  voice: {
    tone: string[];
    humor: string;
    readingLevel: string;
    bannedWords: string[];
    signaturePhrases: string[];
  };
  behavior: {
    opensWith: string[];
    disagreementStyle: string;
    uncertaintyProtocol: string;
  };
  knowledge: {
    namespaces: string[];
    kbPolicy: {
      whenToQuery: string[];
      whenNotToQuery: string[];
    };
  };
  output: {
    maxLength: 'short' | 'medium' | 'long';
    structure: string[];
  };
  safety: {
    crisis: {
      selfHarm: string;
    };
  };
}

export function AvatarManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAvatar, setEditingAvatar] = useState<AvatarProfile | null>(null);
  const [namespaceInput, setNamespaceInput] = useState("");
  const [personaData, setPersonaData] = useState<PersonaSpec | null>(null);
  const [personaOpen, setPersonaOpen] = useState(false);
  const [previewPrompt, setPreviewPrompt] = useState<string | null>(null);
  const [personaEditMode, setPersonaEditMode] = useState(false);
  const [editablePersona, setEditablePersona] = useState<PersonaSpec | null>(null);
  const [personaSaving, setPersonaSaving] = useState(false);
  const [newToneInput, setNewToneInput] = useState("");
  const [newBannedWordInput, setNewBannedWordInput] = useState("");
  const [newPhraseInput, setNewPhraseInput] = useState("");
  const [personaUploading, setPersonaUploading] = useState(false);
  const [pastedPersonaText, setPastedPersonaText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadingAnimationInputRef = useRef<HTMLInputElement>(null);
  const [loadingAnimationUploading, setLoadingAnimationUploading] = useState(false);

  // Form state
  const [formData, setFormData] = useState<InsertAvatarProfile>({
    id: "",
    name: "",
    description: "",
    profileImageUrl: null,
    streamingPlatform: "liveavatar",
    useHeygenVoiceForInteractive: false,
    interactiveVoiceSource: "elevenlabs",
    liveAvatarId: null,
    heygenAvatarId: null,
    heygenVoiceId: null,
    heygenVideoAvatarId: null,
    heygenVideoVoiceId: null,
    heygenKnowledgeId: null,
    elevenlabsVoiceId: null,
    audioOnlyVoiceId: null,
    liveAvatarVoiceId: null,
    useHeygenVoiceForLive: false,
    voiceRate: "1.0",
    languageCode: "en-US",
    elevenLabsLanguageCode: "en",
    personalityPrompt: "",
    pineconeNamespaces: [],
    usePubMed: false,
    useWikipedia: false,
    useGoogleSearch: false,
    enableAudioMode: true,
    enableVideoMode: true,
    enableVideoCreation: true,
    loadingAnimationUrl: null,
    isActive: true,
  });

  // Fetch all avatars
  const { data: avatars, isLoading } = useQuery<AvatarProfile[]>({
    queryKey: ["/api/admin/avatars"],
  });

  // Create avatar mutation
  const createMutation = useMutation({
    mutationFn: async (data: InsertAvatarProfile) => {
      return await apiRequest("/api/admin/avatars", "POST", data);
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
      return await apiRequest(`/api/admin/avatars/${id}`, "PUT", data);
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
      return await apiRequest(`/api/admin/avatars/${id}`, "DELETE");
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
      profileImageUrl: null,
      streamingPlatform: "liveavatar",
      useHeygenVoiceForInteractive: false,
      interactiveVoiceSource: "elevenlabs",
      liveAvatarId: null,
      heygenAvatarId: null,
      heygenVoiceId: null,
      heygenVideoAvatarId: null,
      heygenVideoVoiceId: null,
      heygenKnowledgeId: null,
      elevenlabsVoiceId: null,
      liveAvatarVoiceId: null,
      useHeygenVoiceForLive: false,
      voiceRate: "1.0",
      languageCode: "en-US",
      elevenLabsLanguageCode: "en",
      personalityPrompt: "",
      pineconeNamespaces: [],
      usePubMed: false,
      useWikipedia: false,
      useGoogleSearch: false,
      enableAudioMode: true,
      enableVideoMode: true,
      enableVideoCreation: true,
      loadingAnimationUrl: null,
      isActive: true,
    });
    setIsDialogOpen(true);
  };

  const handleOpenEditDialog = (avatar: AvatarProfile) => {
    setEditingAvatar(avatar);
    // Derive interactiveVoiceSource from useHeygenVoiceForInteractive for backward compatibility
    const derivedVoiceSource = (avatar as any).interactiveVoiceSource || 
      (avatar.useHeygenVoiceForInteractive ? "heygen" : "elevenlabs");
    setFormData({
      id: avatar.id,
      name: avatar.name,
      description: avatar.description,
      profileImageUrl: avatar.profileImageUrl || null,
      streamingPlatform: avatar.streamingPlatform || "liveavatar",
      useHeygenVoiceForInteractive: avatar.useHeygenVoiceForInteractive || false,
      interactiveVoiceSource: derivedVoiceSource,
      liveAvatarId: avatar.liveAvatarId,
      heygenAvatarId: avatar.heygenAvatarId,
      heygenVoiceId: avatar.heygenVoiceId,
      heygenVideoAvatarId: avatar.heygenVideoAvatarId,
      heygenVideoVoiceId: avatar.heygenVideoVoiceId,
      heygenKnowledgeId: avatar.heygenKnowledgeId,
      elevenlabsVoiceId: avatar.elevenlabsVoiceId,
      audioOnlyVoiceId: (avatar as any).audioOnlyVoiceId || null,
      liveAvatarVoiceId: (avatar as any).liveAvatarVoiceId || null,
      useHeygenVoiceForLive: avatar.useHeygenVoiceForLive || false,
      voiceRate: avatar.voiceRate || "1.0",
      languageCode: avatar.languageCode || "en-US",
      elevenLabsLanguageCode: avatar.elevenLabsLanguageCode || "en",
      personalityPrompt: avatar.personalityPrompt,
      pineconeNamespaces: avatar.pineconeNamespaces,
      usePubMed: avatar.usePubMed || false,
      useWikipedia: avatar.useWikipedia || false,
      useGoogleSearch: avatar.useGoogleSearch || false,
      enableAudioMode: avatar.enableAudioMode ?? true,
      enableVideoMode: avatar.enableVideoMode ?? true,
      enableVideoCreation: avatar.enableVideoCreation ?? true,
      loadingAnimationUrl: avatar.loadingAnimationUrl || null,
      isActive: avatar.isActive,
    });
    setIsDialogOpen(true);
    
    fetchPersonaData(avatar.id);
  };

  const getAdminHeaders = (): HeadersInit => {
    const headers: Record<string, string> = {};
    const adminSecret = localStorage.getItem('admin_secret');
    if (adminSecret) {
      headers['X-Admin-Secret'] = adminSecret;
    }
    return headers;
  };

  const fetchPersonaData = async (avatarId: string) => {
    try {
      const response = await fetch(`/api/admin/personas/${avatarId}`, {
        headers: getAdminHeaders(),
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setPersonaData(data);
      } else {
        setPersonaData(null);
      }
    } catch (error) {
      setPersonaData(null);
    }
    setPreviewPrompt(null);
    setPersonaOpen(false);
  };

  const fetchPreviewPrompt = async (avatarId: string) => {
    try {
      const response = await fetch(`/api/admin/personas/${avatarId}/preview`, {
        headers: getAdminHeaders(),
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setPreviewPrompt(data.systemPrompt);
      }
    } catch (error) {
      toast({
        title: "Failed to preview",
        description: "Could not generate prompt preview",
        variant: "destructive",
      });
    }
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingAvatar(null);
    setNamespaceInput("");
    setPersonaData(null);
    setPersonaOpen(false);
    setPreviewPrompt(null);
    setPersonaEditMode(false);
    setEditablePersona(null);
    setNewToneInput("");
    setNewBannedWordInput("");
    setNewPhraseInput("");
  };

  const startPersonaEdit = () => {
    if (personaData) {
      setEditablePersona(JSON.parse(JSON.stringify(personaData)));
      setPersonaEditMode(true);
    }
  };

  const cancelPersonaEdit = () => {
    setPersonaEditMode(false);
    setEditablePersona(null);
    setNewToneInput("");
    setNewBannedWordInput("");
    setNewPhraseInput("");
  };

  const savePersona = async () => {
    if (!editablePersona || !editingAvatar) return;
    
    setPersonaSaving(true);
    try {
      const adminSecret = localStorage.getItem('admin_secret');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (adminSecret) {
        headers['X-Admin-Secret'] = adminSecret;
      }
      
      const response = await fetch(`/api/admin/personas/${editingAvatar.id}`, {
        method: 'PUT',
        headers,
        credentials: 'include',
        body: JSON.stringify(editablePersona),
      });
      
      if (response.ok) {
        const data = await response.json();
        setPersonaData(data.persona);
        setPersonaEditMode(false);
        setEditablePersona(null);
        toast({
          title: "Persona saved",
          description: "Personality Engine settings updated successfully.",
        });
      } else {
        throw new Error('Failed to save');
      }
    } catch (error) {
      toast({
        title: "Failed to save",
        description: "Could not save persona settings",
        variant: "destructive",
      });
    }
    setPersonaSaving(false);
  };

  const createDefaultPersona = async () => {
    if (!editingAvatar) return;
    
    const defaultPersona: PersonaSpec = {
      id: editingAvatar.id,
      displayName: editingAvatar.name,
      oneLiner: "Expert guide and advisor.",
      role: "Knowledgeable assistant",
      audience: ["general users"],
      boundaries: {
        notA: ["doctor", "therapist", "lawyer"],
        refuseTopics: []
      },
      voice: {
        tone: ["warm", "helpful", "knowledgeable"],
        humor: "occasional and appropriate",
        readingLevel: "accessible",
        bannedWords: [],
        signaturePhrases: []
      },
      behavior: {
        opensWith: ["direct answer", "helpful context"],
        disagreementStyle: "respectful and evidence-based",
        uncertaintyProtocol: "acknowledge limits, offer what is known"
      },
      knowledge: {
        namespaces: editingAvatar.pineconeNamespaces || [],
        kbPolicy: {
          whenToQuery: ["user asks for specific information"],
          whenNotToQuery: ["casual conversation"]
        }
      },
      output: {
        maxLength: "medium",
        structure: ["answer first", "supporting detail"]
      },
      safety: {
        crisis: {
          selfHarm: "offer compassion, encourage professional help"
        }
      }
    };
    
    setEditablePersona(defaultPersona);
    setPersonaEditMode(true);
  };

  const handleUploadPersonaDocument = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !editingAvatar) return;
    
    setPersonaUploading(true);
    
    try {
      const uploadFormData = new FormData();
      uploadFormData.append('document', file);
      
      const headers: Record<string, string> = {};
      const adminSecret = localStorage.getItem('admin_secret');
      if (adminSecret) {
        headers['X-Admin-Secret'] = adminSecret;
      }
      
      const response = await fetch(`/api/admin/personas/${editingAvatar.id}/from-document`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: uploadFormData,
      });
      
      if (response.ok) {
        const data = await response.json();
        setEditablePersona(data.persona);
        setPersonaEditMode(true);
        toast({
          title: "Document processed",
          description: "Review the extracted personality and click Save when ready.",
        });
      } else {
        const error = await response.json();
        throw new Error(error.error || 'Failed to process document');
      }
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error.message || "Could not process the document",
        variant: "destructive",
      });
    }
    
    setPersonaUploading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handlePastePersonaText = async () => {
    if (!pastedPersonaText.trim() || !editingAvatar) return;
    
    if (pastedPersonaText.trim().length < 50) {
      toast({
        title: "Text too short",
        description: "Please paste at least 50 characters of personality description",
        variant: "destructive",
      });
      return;
    }
    
    setPersonaUploading(true);
    
    try {
      const adminSecret = localStorage.getItem('admin_secret');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (adminSecret) {
        headers['X-Admin-Secret'] = adminSecret;
      }
      
      const response = await fetch(`/api/admin/personas/${editingAvatar.id}/from-text`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ text: pastedPersonaText }),
      });
      
      if (response.ok) {
        const data = await response.json();
        setEditablePersona(data.persona);
        setPersonaEditMode(true);
        setPastedPersonaText("");
        toast({
          title: "Text processed",
          description: "Review the extracted personality and click Save when ready.",
        });
      } else {
        const error = await response.json();
        throw new Error(error.error || 'Failed to process text');
      }
    } catch (error: any) {
      toast({
        title: "Processing failed",
        description: error.message || "Could not process the text",
        variant: "destructive",
      });
    }
    
    setPersonaUploading(false);
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

  const handleToggleCategory = (category: string) => {
    const currentNamespaces = formData.pineconeNamespaces || [];
    const categoryLower = category.toLowerCase().replace(/_/g, '-');
    
    // Check if any version of this category exists (case-insensitive, handling underscores vs hyphens)
    const existingIndex = currentNamespaces.findIndex(ns => 
      ns.toLowerCase().replace(/_/g, '-') === categoryLower
    );
    
    if (existingIndex !== -1) {
      // Remove the existing namespace (whatever case it is)
      setFormData({
        ...formData,
        pineconeNamespaces: currentNamespaces.filter((_, i) => i !== existingIndex),
      });
    } else {
      // Add the category in uppercase (standard format)
      setFormData({
        ...formData,
        pineconeNamespaces: [...currentNamespaces, category],
      });
    }
  };
  
  // Helper to check if a category is selected (case-insensitive)
  const isCategorySelected = (category: string) => {
    const categoryLower = category.toLowerCase().replace(/_/g, '-');
    return (formData.pineconeNamespaces || []).some(ns => 
      ns.toLowerCase().replace(/_/g, '-') === categoryLower
    );
  };
  
  // Get orphan namespaces (those not matching any PINECONE_CATEGORIES)
  const getOrphanNamespaces = () => {
    const categoriesLower = PINECONE_CATEGORIES.map(c => c.toLowerCase().replace(/_/g, '-'));
    return (formData.pineconeNamespaces || []).filter(ns => 
      !categoriesLower.includes(ns.toLowerCase().replace(/_/g, '-'))
    );
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
    // Sync deprecated useHeygenVoiceForInteractive with new interactiveVoiceSource for backward compatibility
    const cleanedData = {
      ...formData,
      id: formData.id.trim(),
      name: formData.name.trim(),
      description: formData.description.trim(),
      personalityPrompt: formData.personalityPrompt.trim(),
      profileImageUrl: formData.profileImageUrl?.trim() || null,
      streamingPlatform: formData.streamingPlatform || "liveavatar",
      interactiveVoiceSource: formData.interactiveVoiceSource || "elevenlabs",
      useHeygenVoiceForInteractive: formData.interactiveVoiceSource === "heygen", // Sync deprecated flag
      liveAvatarId: formData.liveAvatarId?.trim() || null,
      heygenAvatarId: formData.heygenAvatarId?.trim() || null,
      heygenVoiceId: formData.heygenVoiceId?.trim() || null,
      heygenVideoAvatarId: formData.heygenVideoAvatarId?.trim() || null,
      heygenVideoVoiceId: formData.heygenVideoVoiceId?.trim() || null,
      heygenKnowledgeId: formData.heygenKnowledgeId?.trim() || null,
      elevenlabsVoiceId: formData.elevenlabsVoiceId?.trim() || null,
      audioOnlyVoiceId: formData.audioOnlyVoiceId?.trim() || null,
      liveAvatarVoiceId: formData.liveAvatarVoiceId?.trim() || null,
      voiceRate: formData.voiceRate?.trim() || null,
      languageCode: formData.languageCode?.trim() || "en-US",
      elevenLabsLanguageCode: formData.elevenLabsLanguageCode?.trim() || "en",
      loadingAnimationUrl: formData.loadingAnimationUrl?.trim() || null,
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
                <TableHead className="w-16">Avatar</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {avatars?.map((avatar) => (
                <TableRow key={avatar.id}>
                  <TableCell>
                    <div className="w-10 h-10 rounded-full overflow-hidden bg-muted flex items-center justify-center">
                      {avatar.profileImageUrl ? (
                        <img 
                          src={avatar.profileImageUrl} 
                          alt={avatar.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-primary/20 to-primary/40 flex items-center justify-center text-xs font-medium text-primary">
                          {avatar.name.charAt(0)}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">{avatar.name}</TableCell>
                  <TableCell className="max-w-xs">
                    <MarqueeText text={avatar.description} className="text-sm text-muted-foreground" />
                  </TableCell>
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
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>{editingAvatar ? "Edit Avatar" : "Create Avatar"}</DialogTitle>
            <DialogDescription>
              {editingAvatar
                ? "Update the avatar configuration and personality."
                : "Create a new AI avatar with a unique personality."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto min-h-0">
          <form id="avatar-form" onSubmit={handleSubmit} className="space-y-4 pr-2">
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

            <div className="space-y-2">
              <Label htmlFor="profileImageUrl">Profile Image URL</Label>
              <Input
                id="profileImageUrl"
                value={formData.profileImageUrl || ""}
                onChange={(e) => setFormData({ ...formData, profileImageUrl: e.target.value || null })}
                placeholder="https://example.com/avatar.jpg"
                data-testid="input-profile-image-url"
              />
              <p className="text-xs text-muted-foreground">
                Optional. Provide a URL to an avatar image (jpg, png, svg)
              </p>
              
              {/* Profile Image Preview and Create Videos Button */}
              {formData.profileImageUrl && (
                <div className="flex flex-col items-center gap-3 p-4 border rounded-lg bg-muted/30">
                  <img 
                    src={formData.profileImageUrl} 
                    alt={formData.name || "Avatar preview"}
                    className="w-32 h-32 rounded-full object-cover border-2 border-primary/30"
                  />
                  {editingAvatar && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => {
                        setIsDialogOpen(false);
                        setLocation(`/admin?view=courses&avatarId=${editingAvatar.id}`);
                      }}
                      data-testid="button-create-videos"
                    >
                      <Video className="w-4 h-4" />
                      Create Custom Videos
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Loading Animation Upload */}
            <div className="space-y-2">
              <Label htmlFor="loadingAnimationUrl" className="flex items-center gap-2">
                <Film className="w-4 h-4" />
                Loading Animation (Chat)
              </Label>
              <div className="flex gap-2">
                <Input
                  id="loadingAnimationUrl"
                  value={formData.loadingAnimationUrl || ""}
                  onChange={(e) => setFormData({ ...formData, loadingAnimationUrl: e.target.value || null })}
                  placeholder="URL to video/gif shown while avatar loads"
                  className="flex-1"
                  data-testid="input-loading-animation-url"
                />
                <input
                  type="file"
                  ref={loadingAnimationInputRef}
                  accept="video/mp4,video/webm,image/gif"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    
                    setLoadingAnimationUploading(true);
                    try {
                      const formDataUpload = new FormData();
                      formDataUpload.append('file', file);
                      
                      const response = await fetch('/api/admin/upload-asset', {
                        method: 'POST',
                        headers: {
                          'X-Admin-Secret': localStorage.getItem('adminSecret') || '',
                        },
                        body: formDataUpload,
                      });
                      
                      if (!response.ok) {
                        throw new Error('Failed to upload file');
                      }
                      
                      const data = await response.json();
                      setFormData({ ...formData, loadingAnimationUrl: data.url });
                      toast({
                        title: "Upload successful",
                        description: "Loading animation uploaded",
                      });
                    } catch (error) {
                      toast({
                        title: "Upload failed",
                        description: "Could not upload loading animation",
                        variant: "destructive",
                      });
                    } finally {
                      setLoadingAnimationUploading(false);
                      if (loadingAnimationInputRef.current) {
                        loadingAnimationInputRef.current.value = '';
                      }
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={loadingAnimationUploading}
                  onClick={() => loadingAnimationInputRef.current?.click()}
                  className="gap-1"
                >
                  {loadingAnimationUploading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4" />
                  )}
                  Upload
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Optional. Video or GIF shown while avatar is loading in chat. Accepts MP4, WebM, or GIF.
              </p>
              
              {/* Loading Animation Preview */}
              {formData.loadingAnimationUrl && (
                <div className="flex flex-col items-center gap-2 p-4 border rounded-lg bg-muted/30">
                  {formData.loadingAnimationUrl.includes('mp4') || formData.loadingAnimationUrl.includes('webm') ? (
                    <video 
                      src={formData.loadingAnimationUrl}
                      autoPlay
                      loop
                      muted
                      playsInline
                      className="w-32 h-32 rounded-full object-cover border-2 border-primary/30"
                    />
                  ) : (
                    <img 
                      src={formData.loadingAnimationUrl}
                      alt="Loading animation preview"
                      className="w-32 h-32 rounded-full object-cover border-2 border-primary/30"
                    />
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setFormData({ ...formData, loadingAnimationUrl: null })}
                    className="text-xs text-destructive hover:text-destructive"
                  >
                    <X className="w-3 h-3 mr-1" />
                    Remove
                  </Button>
                </div>
              )}
            </div>

            {/* Voice & Avatar Configuration by Mode */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b">
                <span className="text-sm font-semibold text-primary">Voice & Avatar Configuration</span>
                <span className="text-xs text-muted-foreground">(Configure IDs for each mode)</span>
              </div>

              {/* Interactive Chat Mode */}
              <div className="p-4 border rounded-lg bg-blue-500/5 border-blue-500/20">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                  <span className="text-sm font-medium text-blue-400">Interactive Chat Mode</span>
                  <span className="text-xs text-muted-foreground">(Live video streaming)</span>
                </div>
                
                {/* LiveAvatar ID */}
                <div className="mb-4">
                  <div className="space-y-2">
                    <Label htmlFor="liveAvatarId" className="text-xs">LiveAvatar ID</Label>
                    <Input
                      id="liveAvatarId"
                      value={formData.liveAvatarId || ""}
                      onChange={(e) => setFormData({ ...formData, liveAvatarId: e.target.value || null })}
                      placeholder="LiveAvatar platform ID"
                      className="text-sm"
                      data-testid="input-live-avatar-id"
                    />
                  </div>
                </div>

                {/* Voice Source Selection for Interactive */}
                <div className="p-3 rounded-md bg-background/50 border">
                  <div className="mb-3">
                    <span className="text-xs font-medium">Interactive Voice Source</span>
                    <p className="text-xs text-muted-foreground">
                      {formData.interactiveVoiceSource === "elevenlabs" && "Using ElevenLabs voice for chat"}
                      {formData.interactiveVoiceSource === "liveavatar" && "Using LiveAvatar's built-in voice for chat"}
                    </p>
                  </div>
                  
                  <RadioGroup
                    value={formData.interactiveVoiceSource === "heygen" ? "liveavatar" : (formData.interactiveVoiceSource || "liveavatar")}
                    onValueChange={(value) => setFormData({ 
                      ...formData, 
                      interactiveVoiceSource: value as "elevenlabs" | "liveavatar",
                      useHeygenVoiceForInteractive: false
                    })}
                    className="flex gap-4 mb-3"
                    data-testid="radio-interactive-voice-source"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="elevenlabs" id="voice-elevenlabs" data-testid="radio-voice-elevenlabs" />
                      <Label htmlFor="voice-elevenlabs" className={`text-xs cursor-pointer ${formData.interactiveVoiceSource === "elevenlabs" ? "text-blue-400 font-medium" : ""}`}>
                        ElevenLabs
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="liveavatar" id="voice-liveavatar" data-testid="radio-voice-liveavatar" />
                      <Label htmlFor="voice-liveavatar" className={`text-xs cursor-pointer ${formData.interactiveVoiceSource === "liveavatar" ? "text-blue-400 font-medium" : ""}`}>
                        LiveAvatar
                      </Label>
                    </div>
                  </RadioGroup>
                  
                  <div className="grid grid-cols-2 gap-3">
                    {/* ElevenLabs Voice ID */}
                    <div className={`space-y-2 transition-opacity ${formData.interactiveVoiceSource !== "elevenlabs" ? 'opacity-40' : ''}`}>
                      <Label htmlFor="elevenlabsVoiceIdLive" className="text-xs">ElevenLabs Voice ID</Label>
                      <Input
                        id="elevenlabsVoiceIdLive"
                        value={formData.elevenlabsVoiceId || ""}
                        onChange={(e) => setFormData({ ...formData, elevenlabsVoiceId: e.target.value || null })}
                        placeholder="ElevenLabs voice ID"
                        className="text-sm"
                        disabled={formData.interactiveVoiceSource !== "elevenlabs"}
                        data-testid="input-elevenlabs-voice-id-live"
                      />
                    </div>
                    
                    {/* LiveAvatar Voice ID */}
                    <div className={`space-y-2 transition-opacity ${formData.interactiveVoiceSource !== "liveavatar" ? 'opacity-40' : ''}`}>
                      <Label htmlFor="liveAvatarVoiceId" className="text-xs">LiveAvatar Voice ID</Label>
                      <Input
                        id="liveAvatarVoiceId"
                        value={formData.liveAvatarVoiceId || ""}
                        onChange={(e) => setFormData({ ...formData, liveAvatarVoiceId: e.target.value || null })}
                        placeholder="LiveAvatar voice ID"
                        className="text-sm"
                        disabled={formData.interactiveVoiceSource !== "liveavatar"}
                        data-testid="input-live-avatar-voice-id"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Video Creation Mode */}
              <div className="p-4 border rounded-lg bg-purple-500/5 border-purple-500/20">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                  <span className="text-sm font-medium text-purple-400">Video Creation Mode</span>
                  <span className="text-xs text-muted-foreground">(Generate videos on demand)</span>
                </div>
                <div className="space-y-4">
                  {/* Video Avatar ID */}
                  <div className="space-y-2">
                    <Label htmlFor="heygenVideoAvatarId" className="text-xs">HeyGen Video Avatar ID</Label>
                    <Input
                      id="heygenVideoAvatarId"
                      value={formData.heygenVideoAvatarId || ""}
                      onChange={(e) => setFormData({ ...formData, heygenVideoAvatarId: e.target.value || null })}
                      placeholder="Video avatar ID"
                      className="text-sm"
                      data-testid="input-heygen-video-avatar-id"
                    />
                  </div>
                  
                  {/* Voice Source Toggle for Video */}
                  <div className="p-3 rounded-md bg-background/50 border">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <span className="text-xs font-medium">Video Voice Source</span>
                        <p className="text-xs text-muted-foreground">
                          {formData.useHeygenVoiceForLive 
                            ? "Using HeyGen's built-in voice for video generation" 
                            : "Using ElevenLabs voice for video generation"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs ${!formData.useHeygenVoiceForLive ? "text-blue-400 font-medium" : "text-muted-foreground"}`}>ElevenLabs</span>
                        <Switch
                          checked={formData.useHeygenVoiceForLive || false}
                          onCheckedChange={(checked) => setFormData({ ...formData, useHeygenVoiceForLive: checked })}
                          data-testid="switch-video-voice-source"
                        />
                        <span className={`text-xs ${formData.useHeygenVoiceForLive ? "text-blue-400 font-medium" : "text-muted-foreground"}`}>HeyGen</span>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      {/* ElevenLabs Voice ID - for video when using ElevenLabs */}
                      <div className={`space-y-2 transition-opacity ${formData.useHeygenVoiceForLive ? 'opacity-40' : ''}`}>
                        <Label htmlFor="elevenlabsVoiceIdVideo" className="text-xs">ElevenLabs Voice ID</Label>
                        <Input
                          id="elevenlabsVoiceIdVideo"
                          value={formData.elevenlabsVoiceId || ""}
                          onChange={(e) => setFormData({ ...formData, elevenlabsVoiceId: e.target.value || null })}
                          placeholder="ElevenLabs voice ID"
                          className="text-sm"
                          disabled={formData.useHeygenVoiceForLive}
                          data-testid="input-elevenlabs-voice-id-video"
                        />
                      </div>
                      
                      {/* HeyGen Voice ID - for video when using HeyGen */}
                      <div className={`space-y-2 transition-opacity ${!formData.useHeygenVoiceForLive ? 'opacity-40' : ''}`}>
                        <Label htmlFor="heygenVideoVoiceId" className="text-xs">HeyGen Video Voice ID</Label>
                        <Input
                          id="heygenVideoVoiceId"
                          value={formData.heygenVideoVoiceId || ""}
                          onChange={(e) => setFormData({ ...formData, heygenVideoVoiceId: e.target.value || null })}
                          placeholder="HeyGen voice ID"
                          className="text-sm"
                          disabled={!formData.useHeygenVoiceForLive}
                          data-testid="input-heygen-video-voice-id"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Audio-Only Mode */}
              <div className="p-4 border rounded-lg bg-green-500/5 border-green-500/20">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-green-500"></div>
                  <span className="text-sm font-medium text-green-400">Audio-Only Mode</span>
                  <span className="text-xs text-muted-foreground">(ElevenLabs voice synthesis)</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="audioOnlyVoiceId" className="text-xs">ElevenLabs Voice ID</Label>
                    <Input
                      id="audioOnlyVoiceId"
                      value={formData.audioOnlyVoiceId || ""}
                      onChange={(e) => setFormData({ ...formData, audioOnlyVoiceId: e.target.value || null })}
                      placeholder="ElevenLabs voice ID for audio-only"
                      className="text-sm"
                      data-testid="input-audio-only-voice-id"
                    />
                    <p className="text-xs text-muted-foreground">
                      Dedicated voice for audio-only chat mode
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="voiceRate" className="text-xs">Voice Rate</Label>
                    <Input
                      id="voiceRate"
                      value={formData.voiceRate || ""}
                      onChange={(e) => setFormData({ ...formData, voiceRate: e.target.value || null })}
                      placeholder="1.0"
                      className="text-sm"
                      data-testid="input-voice-rate"
                    />
                    <p className="text-xs text-muted-foreground">
                      Speed multiplier (1.0 = normal)
                    </p>
                  </div>
                </div>
              </div>

              {/* Language Settings */}
              <div className="p-4 border rounded-lg bg-orange-500/5 border-orange-500/20">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                  <span className="text-sm font-medium text-orange-400">Language Settings</span>
                  <span className="text-xs text-muted-foreground">(Speech recognition & synthesis)</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="languageCode" className="text-xs">Speech Recognition Language</Label>
                    <Input
                      id="languageCode"
                      value={formData.languageCode || "en-US"}
                      onChange={(e) => setFormData({ ...formData, languageCode: e.target.value || "en-US" })}
                      placeholder="en-US"
                      className="text-sm"
                      data-testid="input-language-code"
                    />
                    <p className="text-xs text-muted-foreground">
                      BCP-47 code (e.g., en-US, es-ES, fr-FR)
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="elevenLabsLanguageCode" className="text-xs">ElevenLabs Language</Label>
                    <Input
                      id="elevenLabsLanguageCode"
                      value={formData.elevenLabsLanguageCode || "en"}
                      onChange={(e) => setFormData({ ...formData, elevenLabsLanguageCode: e.target.value || "en" })}
                      placeholder="en"
                      className="text-sm"
                      data-testid="input-elevenlabs-language-code"
                    />
                    <p className="text-xs text-muted-foreground">
                      ISO 639-1 code (e.g., en, es, fr)
                    </p>
                  </div>
                </div>
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

            {editingAvatar && (
              <Collapsible open={personaOpen} onOpenChange={setPersonaOpen}>
                <div className="space-y-2 p-4 border rounded-lg bg-gradient-to-r from-purple-500/10 to-pink-500/10 border-purple-500/30">
                  <CollapsibleTrigger className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2">
                      <Brain className="w-5 h-5 text-purple-400" />
                      <span className="text-sm font-medium text-purple-300">Personality Engine</span>
                      {personaData ? (
                        <Badge variant="secondary" className="bg-green-500/20 text-green-400 text-xs">Active</Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-gray-500/20 text-gray-400 text-xs">Not Configured</Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">{personaOpen ? '▼' : '▶'}</span>
                  </CollapsibleTrigger>
                  
                  <CollapsibleContent className="space-y-3 pt-3">
                    {personaEditMode && editablePersona ? (
                      <>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">One-liner</Label>
                            <Input
                              value={editablePersona.oneLiner}
                              onChange={(e) => setEditablePersona({...editablePersona, oneLiner: e.target.value})}
                              className="text-sm"
                              data-testid="input-persona-oneliner"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Role</Label>
                            <Input
                              value={editablePersona.role}
                              onChange={(e) => setEditablePersona({...editablePersona, role: e.target.value})}
                              className="text-sm"
                              data-testid="input-persona-role"
                            />
                          </div>
                        </div>
                        
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">Voice Tone</Label>
                          <div className="flex flex-wrap gap-1">
                            {editablePersona.voice.tone.map((t, i) => (
                              <Badge key={i} variant="outline" className="text-xs cursor-pointer hover:bg-destructive" onClick={() => {
                                setEditablePersona({
                                  ...editablePersona,
                                  voice: {...editablePersona.voice, tone: editablePersona.voice.tone.filter((_, idx) => idx !== i)}
                                });
                              }}>
                                {t} ×
                              </Badge>
                            ))}
                          </div>
                          <div className="flex gap-2">
                            <Input
                              value={newToneInput}
                              onChange={(e) => setNewToneInput(e.target.value)}
                              placeholder="Add tone..."
                              className="text-sm flex-1"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && newToneInput.trim()) {
                                  e.preventDefault();
                                  setEditablePersona({
                                    ...editablePersona,
                                    voice: {...editablePersona.voice, tone: [...editablePersona.voice.tone, newToneInput.trim()]}
                                  });
                                  setNewToneInput("");
                                }
                              }}
                              data-testid="input-add-tone"
                            />
                            <Button type="button" size="sm" variant="outline" onClick={() => {
                              if (newToneInput.trim()) {
                                setEditablePersona({
                                  ...editablePersona,
                                  voice: {...editablePersona.voice, tone: [...editablePersona.voice.tone, newToneInput.trim()]}
                                });
                                setNewToneInput("");
                              }
                            }}>
                              <Plus className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                        
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">Banned Words</Label>
                          <div className="flex flex-wrap gap-1">
                            {editablePersona.voice.bannedWords.map((w, i) => (
                              <Badge key={i} variant="destructive" className="text-xs cursor-pointer" onClick={() => {
                                setEditablePersona({
                                  ...editablePersona,
                                  voice: {...editablePersona.voice, bannedWords: editablePersona.voice.bannedWords.filter((_, idx) => idx !== i)}
                                });
                              }}>
                                {w} ×
                              </Badge>
                            ))}
                          </div>
                          <div className="flex gap-2">
                            <Input
                              value={newBannedWordInput}
                              onChange={(e) => setNewBannedWordInput(e.target.value)}
                              placeholder="Add banned word..."
                              className="text-sm flex-1"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && newBannedWordInput.trim()) {
                                  e.preventDefault();
                                  setEditablePersona({
                                    ...editablePersona,
                                    voice: {...editablePersona.voice, bannedWords: [...editablePersona.voice.bannedWords, newBannedWordInput.trim()]}
                                  });
                                  setNewBannedWordInput("");
                                }
                              }}
                              data-testid="input-add-banned-word"
                            />
                            <Button type="button" size="sm" variant="outline" onClick={() => {
                              if (newBannedWordInput.trim()) {
                                setEditablePersona({
                                  ...editablePersona,
                                  voice: {...editablePersona.voice, bannedWords: [...editablePersona.voice.bannedWords, newBannedWordInput.trim()]}
                                });
                                setNewBannedWordInput("");
                              }
                            }}>
                              <Plus className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                        
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">Signature Phrases</Label>
                          <div className="flex flex-wrap gap-1">
                            {editablePersona.voice.signaturePhrases.map((p, i) => (
                              <Badge key={i} variant="secondary" className="text-xs bg-purple-500/20 cursor-pointer" onClick={() => {
                                setEditablePersona({
                                  ...editablePersona,
                                  voice: {...editablePersona.voice, signaturePhrases: editablePersona.voice.signaturePhrases.filter((_, idx) => idx !== i)}
                                });
                              }}>
                                "{p}" ×
                              </Badge>
                            ))}
                          </div>
                          <div className="flex gap-2">
                            <Input
                              value={newPhraseInput}
                              onChange={(e) => setNewPhraseInput(e.target.value)}
                              placeholder="Add signature phrase..."
                              className="text-sm flex-1"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && newPhraseInput.trim()) {
                                  e.preventDefault();
                                  setEditablePersona({
                                    ...editablePersona,
                                    voice: {...editablePersona.voice, signaturePhrases: [...editablePersona.voice.signaturePhrases, newPhraseInput.trim()]}
                                  });
                                  setNewPhraseInput("");
                                }
                              }}
                              data-testid="input-add-phrase"
                            />
                            <Button type="button" size="sm" variant="outline" onClick={() => {
                              if (newPhraseInput.trim()) {
                                setEditablePersona({
                                  ...editablePersona,
                                  voice: {...editablePersona.voice, signaturePhrases: [...editablePersona.voice.signaturePhrases, newPhraseInput.trim()]}
                                });
                                setNewPhraseInput("");
                              }
                            }}>
                              <Plus className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                        
                        <div className="flex gap-2 pt-2">
                          <Button
                            type="button"
                            size="sm"
                            onClick={savePersona}
                            disabled={personaSaving}
                            className="bg-purple-600 hover:bg-purple-700"
                          >
                            {personaSaving ? "Saving..." : "Save Persona"}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={cancelPersonaEdit}
                          >
                            Cancel
                          </Button>
                        </div>
                      </>
                    ) : personaData ? (
                      <>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <span className="text-muted-foreground">One-liner:</span>
                            <p className="text-white">{personaData.oneLiner}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Role:</span>
                            <p className="text-white">{personaData.role}</p>
                          </div>
                        </div>
                        
                        <div className="space-y-2">
                          <span className="text-sm text-muted-foreground">Voice Tone:</span>
                          <div className="flex flex-wrap gap-1">
                            {personaData.voice.tone.map((t, i) => (
                              <Badge key={i} variant="outline" className="text-xs">{t}</Badge>
                            ))}
                          </div>
                        </div>
                        
                        <div className="space-y-2">
                          <span className="text-sm text-muted-foreground">Banned Words:</span>
                          <div className="flex flex-wrap gap-1">
                            {personaData.voice.bannedWords.map((w, i) => (
                              <Badge key={i} variant="destructive" className="text-xs">{w}</Badge>
                            ))}
                          </div>
                        </div>
                        
                        <div className="space-y-2">
                          <span className="text-sm text-muted-foreground">Signature Phrases:</span>
                          <div className="flex flex-wrap gap-1">
                            {personaData.voice.signaturePhrases.map((p, i) => (
                              <Badge key={i} variant="secondary" className="text-xs bg-purple-500/20">"{p}"</Badge>
                            ))}
                          </div>
                        </div>
                        
                        <div className="flex gap-2 pt-2">
                          <Button
                            type="button"
                            size="sm"
                            onClick={startPersonaEdit}
                            className="bg-purple-600 hover:bg-purple-700"
                          >
                            <Edit2 className="w-3 h-3 mr-1" />
                            Edit Persona
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => fetchPreviewPrompt(editingAvatar.id)}
                            className="text-xs"
                          >
                            <Eye className="w-3 h-3 mr-1" />
                            Preview
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => fetchPersonaData(editingAvatar.id)}
                            className="text-xs"
                          >
                            <RefreshCw className="w-3 h-3 mr-1" />
                            Refresh
                          </Button>
                        </div>
                        
                        {previewPrompt && (
                          <div className="mt-3 p-3 bg-black/50 rounded-lg max-h-60 overflow-y-auto">
                            <pre className="text-xs text-gray-300 whitespace-pre-wrap">{previewPrompt}</pre>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-sm text-muted-foreground">
                          No persona configured for this avatar yet. Paste a personality description below:
                        </p>
                        <Textarea
                          placeholder="Paste your personality description here... (e.g., 'Dr. Smith is a warm, knowledgeable psychologist who specializes in cognitive behavioral therapy. She speaks in a calm, reassuring tone and often uses analogies to explain complex concepts...')"
                          value={pastedPersonaText}
                          onChange={(e) => setPastedPersonaText(e.target.value)}
                          className="min-h-[120px] text-sm"
                          data-testid="input-persona-text"
                        />
                        <div className="flex gap-2 flex-wrap">
                          <Button
                            type="button"
                            size="sm"
                            onClick={handlePastePersonaText}
                            disabled={personaUploading || !pastedPersonaText.trim()}
                            className="bg-purple-600 hover:bg-purple-700"
                            data-testid="button-extract-persona"
                          >
                            <Sparkles className="w-3 h-3 mr-1" />
                            {personaUploading ? "Processing..." : "Extract Persona"}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={createDefaultPersona}
                            data-testid="button-create-manually"
                          >
                            <Plus className="w-3 h-3 mr-1" />
                            Create Manually
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          AI will analyze your text and extract a structured personality profile
                        </p>
                      </div>
                    )}
                  </CollapsibleContent>
                </div>
              </Collapsible>
            )}

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Knowledge Categories *</Label>
                <span className="text-sm text-muted-foreground">
                  {(formData.pineconeNamespaces || []).length} selected
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Select which topic categories this avatar can answer questions about
              </p>
              <div className="grid grid-cols-2 gap-3 p-4 border rounded-lg bg-muted/30">
                {PINECONE_CATEGORIES.map((category) => (
                  <div key={category} className="flex items-center space-x-2">
                    <Checkbox
                      id={`category-${category}`}
                      checked={isCategorySelected(category)}
                      onCheckedChange={() => handleToggleCategory(category)}
                      data-testid={`checkbox-category-${category}`}
                    />
                    <Label
                      htmlFor={`category-${category}`}
                      className="text-sm font-normal cursor-pointer"
                    >
                      {category}
                    </Label>
                  </div>
                ))}
              </div>
              {(formData.pineconeNamespaces || []).length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {(formData.pineconeNamespaces || []).map((ns) => {
                    const isOrphan = getOrphanNamespaces().includes(ns);
                    return (
                      <Badge 
                        key={ns} 
                        variant={isOrphan ? "destructive" : "secondary"} 
                        className={`text-xs ${isOrphan ? 'cursor-pointer' : ''}`}
                        onClick={isOrphan ? () => handleRemoveNamespace(ns) : undefined}
                        title={isOrphan ? `Click to remove orphan namespace "${ns}"` : undefined}
                      >
                        {ns}
                        {isOrphan && <X className="w-3 h-3 ml-1" />}
                      </Badge>
                    );
                  })}
                </div>
              )}
              {getOrphanNamespaces().length > 0 && (
                <p className="text-xs text-destructive">
                  ⚠️ {getOrphanNamespaces().length} orphan namespace(s) found that don't match any predefined category. Click to remove.
                </p>
              )}
              
              {/* Optional: Manual namespace input for custom namespaces */}
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  Add custom namespace (advanced)
                </summary>
                <div className="flex gap-2 mt-2">
                  <Input
                    id="namespace"
                    value={namespaceInput}
                    onChange={(e) => setNamespaceInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddNamespace())}
                    placeholder="e.g., custom-namespace"
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
              </details>
            </div>

            <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
              <Label className="text-sm font-medium">Research Sources</Label>
              <p className="text-xs text-muted-foreground mb-3">
                Enable additional knowledge sources for this avatar
              </p>
              
              <div className="flex items-center space-x-2">
                <Switch
                  id="usePubMed"
                  checked={formData.usePubMed}
                  onCheckedChange={(checked) => setFormData({ ...formData, usePubMed: checked })}
                  data-testid="switch-use-pubmed"
                />
                <Label htmlFor="usePubMed" className="font-normal">PubMed Research</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="useWikipedia"
                  checked={formData.useWikipedia}
                  onCheckedChange={(checked) => setFormData({ ...formData, useWikipedia: checked })}
                  data-testid="switch-use-wikipedia"
                />
                <Label htmlFor="useWikipedia" className="font-normal">Wikipedia</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="useGoogleSearch"
                  checked={formData.useGoogleSearch}
                  onCheckedChange={(checked) => setFormData({ ...formData, useGoogleSearch: checked })}
                  data-testid="switch-use-google-search"
                />
                <Label htmlFor="useGoogleSearch" className="font-normal">Google Search</Label>
              </div>
            </div>

            {/* Capability Toggles */}
            <div className="space-y-3 p-4 border rounded-lg bg-yellow-500/5 border-yellow-500/20">
              <Label className="text-sm font-medium text-yellow-400">Enabled Capabilities</Label>
              <p className="text-xs text-muted-foreground mb-3">
                Control which features are available for this avatar
              </p>
              
              <div className="flex items-center space-x-2">
                <Switch
                  id="enableAudioMode"
                  checked={formData.enableAudioMode}
                  onCheckedChange={(checked) => setFormData({ ...formData, enableAudioMode: checked })}
                  data-testid="switch-enable-audio-mode"
                />
                <Label htmlFor="enableAudioMode" className="font-normal">Audio Chat</Label>
                <span className="text-xs text-muted-foreground">(Audio-only conversations)</span>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="enableVideoMode"
                  checked={formData.enableVideoMode}
                  onCheckedChange={(checked) => setFormData({ ...formData, enableVideoMode: checked })}
                  data-testid="switch-enable-video-mode"
                />
                <Label htmlFor="enableVideoMode" className="font-normal">Video Chat</Label>
                <span className="text-xs text-muted-foreground">(Live video streaming)</span>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="enableVideoCreation"
                  checked={formData.enableVideoCreation}
                  onCheckedChange={(checked) => setFormData({ ...formData, enableVideoCreation: checked })}
                  data-testid="switch-enable-video-creation"
                />
                <Label htmlFor="enableVideoCreation" className="font-normal">Video Creation</Label>
                <span className="text-xs text-muted-foreground">(Generate videos & courses)</span>
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

            <div className="h-4"></div>
          </form>
          </div>
          
          <DialogFooter className="flex-shrink-0 border-t pt-4 mt-2 bg-background">
            <Button
              type="button"
              variant="outline"
              onClick={handleCloseDialog}
              disabled={isPending}
              data-testid="button-cancel"
            >
              Cancel
            </Button>
            <Button type="submit" form="avatar-form" disabled={isPending} data-testid="button-save">
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
        </DialogContent>
      </Dialog>
    </div>
  );
}
