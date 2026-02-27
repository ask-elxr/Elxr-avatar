import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Loader2, Upload, AlertTriangle, CheckCircle2, XCircle, Package, RefreshCw, FileArchive, Clock, Sparkles, Play, Edit2, Brain, Trash2, Square } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getAdminHeaders } from "@/lib/adminAuth";

interface PodcastEpisode {
  id: string;
  filename: string;
  status: string;
  chunksCount: number | null;
  discardedCount: number | null;
  error: string | null;
  predictedNamespaces: string[] | null;
  primaryNamespace: string | null;
  confidence: number | null;
  classificationRationale: string | null;
  manualOverride: boolean | null;
}

interface PodcastBatch {
  id: string;
  namespace: string;
  zipFilename: string;
  status: string;
  totalEpisodes: number | null;
  processedEpisodes: number | null;
  successfulEpisodes: number | null;
  failedEpisodes: number | null;
  skippedEpisodes: number | null;
  totalChunks: number | null;
  error: string | null;
  createdAt: string;
  autoDetect: boolean | null;
}

interface BatchStatusResult {
  batch: PodcastBatch;
  episodes: PodcastEpisode[];
  progress: {
    percentage: number;
    processed: number;
    total: number;
    successful: number;
    failed: number;
    skipped: number;
    classifiedCount?: number;
  };
}

const PROTECTED_NAMESPACES = ['mark-kohl', 'markkohl', 'mark_kohl'];

function isProtectedNamespace(namespace: string): boolean {
  const normalized = namespace.toLowerCase().replace(/[^a-z0-9]/g, '');
  return PROTECTED_NAMESPACES.some(p => 
    normalized.includes(p.replace(/[^a-z0-9]/g, ''))
  );
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'completed':
      return <Badge className="bg-green-600"><CheckCircle2 className="w-3 h-3 mr-1" />Completed</Badge>;
    case 'processing':
      return <Badge className="bg-blue-600"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Processing</Badge>;
    case 'failed':
      return <Badge className="bg-red-600"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>;
    case 'skipped':
      return <Badge className="bg-yellow-600"><AlertTriangle className="w-3 h-3 mr-1" />Skipped</Badge>;
    case 'pending':
      return <Badge className="bg-gray-600"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
    case 'extracting':
      return <Badge className="bg-purple-600"><Package className="w-3 h-3 mr-1" />Extracting</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

const NAMESPACE_TAXONOMY = [
  'MIND', 'ADDICTION', 'GRIEF', 'SPIRITUALITY', 'SEXUALITY',
  'BODY', 'NUTRITION', 'LONGEVITY', 'MIDLIFE', 'LIFE', 'SLEEP', 'WORK', 'TRANSITIONS'
];

export function BatchPodcastIngestion() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedNamespace, setSelectedNamespace] = useState<string>("");
  const [customNamespace, setCustomNamespace] = useState<string>("");
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [autoDetect, setAutoDetect] = useState(false);
  const [editingEpisodeId, setEditingEpisodeId] = useState<string | null>(null);
  const [distillMode, setDistillMode] = useState<'chunks' | 'mentor_memory'>('chunks');
  const [mentorName, setMentorName] = useState<string>('');

  const { data: rawStats } = useQuery<{ success: boolean; pinecone?: { namespaces?: Record<string, { recordCount: number }> } }>({
    queryKey: ['/api/pinecone/stats']
  });

  const availableNamespaces = (() => {
    const nsObj = rawStats?.pinecone?.namespaces || {};
    return Object.entries(nsObj)
      .map(([name, stats]) => ({
        namespace: name,
        vectorCount: stats?.recordCount || 0
      }))
      .filter(ns => !isProtectedNamespace(ns.namespace))
      .sort((a, b) => a.namespace.localeCompare(b.namespace));
  })();

  const targetNamespace = customNamespace.trim() || selectedNamespace;

  const { data: batchesData } = useQuery<{ success: boolean; batches: PodcastBatch[] }>({
    queryKey: ['/api/admin/podcast/batches'],
    queryFn: async () => {
      const response = await fetch('/api/admin/podcast/batches', {
        headers: getAdminHeaders()
      });
      if (!response.ok) throw new Error('Failed to fetch batches');
      return response.json();
    },
    refetchInterval: 10000
  });

  const { data: batchStatus, isLoading: isLoadingStatus } = useQuery<{ success: boolean } & BatchStatusResult>({
    queryKey: ['/api/admin/podcast/batch', activeBatchId],
    queryFn: async () => {
      if (!activeBatchId) return null;
      const response = await fetch(`/api/admin/podcast/batch/${activeBatchId}`, {
        headers: getAdminHeaders()
      });
      if (!response.ok) throw new Error('Failed to fetch batch status');
      return response.json();
    },
    enabled: !!activeBatchId,
    refetchInterval: activeBatchId ? 3000 : false
  });

  useEffect(() => {
    if (batchStatus?.batch?.status === 'completed' || batchStatus?.batch?.status === 'failed') {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/podcast/batches'] });
    }
  }, [batchStatus?.batch?.status, queryClient]);

  const retryMutation = useMutation({
    mutationFn: async (batchId: string) => {
      const response = await fetch(`/api/admin/podcast/batch/${batchId}/retry`, {
        method: 'POST',
        headers: getAdminHeaders()
      });
      if (!response.ok) throw new Error('Failed to retry batch');
      return response.json();
    },
    onSuccess: (result) => {
      toast({
        title: "Retry Started",
        description: result.message
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/podcast/batch', activeBatchId] });
    },
    onError: (error: Error) => {
      toast({
        title: "Retry Failed",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const startProcessingMutation = useMutation({
    mutationFn: async (batchId: string) => {
      const response = await fetch(`/api/admin/podcast/batch/${batchId}/start-processing`, {
        method: 'POST',
        headers: getAdminHeaders()
      });
      if (!response.ok) throw new Error('Failed to start processing');
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Processing Started",
        description: "Ingestion started with classified namespaces"
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/podcast/batch', activeBatchId] });
    },
    onError: (error: Error) => {
      toast({
        title: "Processing Failed",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const resumeStuckMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/admin/podcast/batch/resume-stuck', {
        method: 'POST',
        headers: getAdminHeaders()
      });
      if (!response.ok) throw new Error('Failed to resume stuck batches');
      return response.json();
    },
    onSuccess: (result) => {
      toast({
        title: "Resume Complete",
        description: result.message
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/podcast/batches'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Resume Failed",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const cancelBatchMutation = useMutation({
    mutationFn: async (batchId: string) => {
      const response = await fetch(`/api/admin/podcast/batch/${batchId}/cancel`, {
        method: 'POST',
        headers: getAdminHeaders()
      });
      if (!response.ok) throw new Error('Failed to cancel batch');
      return response.json();
    },
    onSuccess: (result) => {
      toast({ title: "Batch Cancelled", description: result.message });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/podcast/batches'] });
    },
    onError: (error: Error) => {
      toast({ title: "Cancel Failed", description: error.message, variant: "destructive" });
    }
  });

  const deleteBatchMutation = useMutation({
    mutationFn: async (batchId: string) => {
      const response = await fetch(`/api/admin/podcast/batch/${batchId}`, {
        method: 'DELETE',
        headers: getAdminHeaders()
      });
      if (!response.ok) throw new Error('Failed to delete batch');
      return response.json();
    },
    onSuccess: (result) => {
      toast({ title: "Batch Deleted", description: result.message });
      setActiveBatchId(null);
      queryClient.invalidateQueries({ queryKey: ['/api/admin/podcast/batches'] });
    },
    onError: (error: Error) => {
      toast({ title: "Delete Failed", description: error.message, variant: "destructive" });
    }
  });

  const updateNamespaceMutation = useMutation({
    mutationFn: async ({ episodeId, primaryNamespace }: { episodeId: string; primaryNamespace: string }) => {
      const response = await fetch(`/api/admin/podcast/episode/${episodeId}/namespace`, {
        method: 'PATCH',
        headers: {
          ...getAdminHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ primaryNamespace })
      });
      if (!response.ok) throw new Error('Failed to update namespace');
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Namespace Updated",
        description: "Episode classification updated"
      });
      setEditingEpisodeId(null);
      queryClient.invalidateQueries({ queryKey: ['/api/admin/podcast/batch', activeBatchId] });
    },
    onError: (error: Error) => {
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.zip')) {
      toast({
        title: "Invalid File Type",
        description: "Please upload a ZIP file containing transcript files",
        variant: "destructive"
      });
      return;
    }

    if (!targetNamespace) {
      toast({
        title: "Missing Namespace",
        description: "Please select or enter a namespace first",
        variant: "destructive"
      });
      return;
    }

    if (isProtectedNamespace(targetNamespace)) {
      toast({
        title: "Protected Namespace",
        description: "This namespace is protected and cannot be modified",
        variant: "destructive"
      });
      return;
    }

    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append('zipFile', file);
      formData.append('namespace', targetNamespace);
      formData.append('autoDetect', String(autoDetect));
      formData.append('distillMode', distillMode);
      if (distillMode === 'mentor_memory' && mentorName.trim()) {
        formData.append('mentorName', mentorName.trim());
      }

      const response = await fetch('/api/admin/podcast/batch/upload', {
        method: 'POST',
        headers: getAdminHeaders(),
        body: formData
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Upload failed');
      }

      const result = await response.json();
      setActiveBatchId(result.batchId);
      
      const modeLabel = distillMode === 'mentor_memory' ? 'Mentor Wisdom' : 'Chunks';
      toast({
        title: autoDetect ? "Classification Started" : `Batch Upload Started (${modeLabel})`,
        description: autoDetect 
          ? `Classifying ${result.totalEpisodes} episodes - review before processing`
          : `Processing ${result.totalEpisodes} episodes from ${file.name}`
      });

      queryClient.invalidateQueries({ queryKey: ['/api/admin/podcast/batches'] });
    } catch (error) {
      toast({
        title: "Upload Failed",
        description: (error as Error).message,
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [targetNamespace, autoDetect, distillMode, mentorName, toast, queryClient]);

  const batches = batchesData?.batches || [];
  const currentBatch = batchStatus?.batch;
  const currentProgress = batchStatus?.progress;
  const currentEpisodes = batchStatus?.episodes || [];

  return (
    <div className="space-y-4">
      <Card className="glass-strong border-white/10">
        <CardHeader>
          <CardTitle className="text-xl text-white flex items-center gap-2">
            <FileArchive className="w-5 h-5 text-purple-400" />
            Batch Podcast Ingestion
          </CardTitle>
          <CardDescription className="text-white/60">
            Upload a ZIP file containing multiple podcast transcripts (.txt, .md, .srt, .vtt files)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-white/80">Target Namespace</Label>
              <Select value={selectedNamespace} onValueChange={setSelectedNamespace}>
                <SelectTrigger className="bg-black/30 border-white/20" data-testid="batch-namespace-select">
                  <SelectValue placeholder="Select existing namespace..." />
                </SelectTrigger>
                <SelectContent>
                  {availableNamespaces.map(ns => (
                    <SelectItem key={ns.namespace} value={ns.namespace}>
                      {ns.namespace} ({ns.vectorCount.toLocaleString()} vectors)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-white/80">Or Create New Namespace</Label>
              <Input
                value={customNamespace}
                onChange={(e) => setCustomNamespace(e.target.value)}
                placeholder="e.g., mark-kohl-podcasts"
                className="bg-black/30 border-white/20"
                data-testid="batch-custom-namespace"
              />
            </div>
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
            <div className="flex items-center gap-3">
              <Sparkles className="w-5 h-5 text-purple-400" />
              <div>
                <Label className="text-white font-medium">Auto-Detect Namespaces</Label>
                <p className="text-xs text-white/50">
                  Use AI to classify each episode into the appropriate namespace(s)
                </p>
              </div>
            </div>
            <Switch
              checked={autoDetect}
              onCheckedChange={setAutoDetect}
              data-testid="auto-detect-toggle"
            />
          </div>

          {autoDetect && (
            <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <p className="text-sm text-blue-300">
                <strong>Auto-Detect Mode:</strong> Episodes will be classified using AI before ingestion. 
                You can review and adjust classifications before processing starts.
                The selected namespace will be used as a fallback.
              </p>
            </div>
          )}

          <div className="flex items-center justify-between p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <div className="flex items-center gap-3">
              <Brain className="w-5 h-5 text-amber-400" />
              <div>
                <Label className="text-white font-medium">Mentor Wisdom Mode</Label>
                <p className="text-xs text-white/50">
                  Distill transcripts into principles, mental models & mentor voice (copyright-safe)
                </p>
              </div>
            </div>
            <Switch
              checked={distillMode === 'mentor_memory'}
              onCheckedChange={(checked) => setDistillMode(checked ? 'mentor_memory' : 'chunks')}
              data-testid="distill-mode-toggle"
            />
          </div>

          {distillMode === 'mentor_memory' && (
            <div className="space-y-2">
              <Label className="text-white/80">Mentor Name</Label>
              <Input
                value={mentorName}
                onChange={(e) => setMentorName(e.target.value)}
                placeholder="e.g., Esther, Mark, Dr. Joe..."
                className="bg-black/30 border-white/20"
                data-testid="mentor-name-input"
              />
              <p className="text-xs text-amber-300/70">
                Insights will be rewritten in this mentor's voice (e.g., "I've noticed...", "What tends to help...")
              </p>
            </div>
          )}

          <div className="flex items-center gap-4">
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileSelect}
              className="hidden"
              data-testid="batch-file-input"
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || !targetNamespace}
              className="gap-2"
              data-testid="batch-upload-btn"
            >
              {isUploading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              {isUploading ? "Uploading..." : "Select ZIP File"}
            </Button>
            {targetNamespace ? (
              <span className="text-sm text-white/50">
                Target: <span className="text-purple-400 font-medium">{targetNamespace}</span>
                {autoDetect && " (fallback)"}
              </span>
            ) : (
              <span className="text-sm text-yellow-400/70">
                Select or create a namespace first
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {currentBatch && (
        <Card className="glass-strong border-purple-500/20">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg text-white flex items-center gap-2">
                <Package className="w-5 h-5 text-purple-400" />
                {currentBatch.zipFilename}
              </CardTitle>
              {getStatusBadge(currentBatch.status)}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {currentProgress && (
              <>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-white/70">Progress</span>
                    <span className="text-white">
                      {currentBatch.status === 'classifying' || (currentBatch.autoDetect && currentBatch.status === 'extracting')
                        ? `${currentProgress.classifiedCount || 0}/${currentProgress.total} classified (${currentProgress.percentage}%)`
                        : `${currentProgress.processed}/${currentProgress.total} episodes (${currentProgress.percentage}%)`
                      }
                    </span>
                  </div>
                  <Progress value={currentProgress.percentage} className="h-2" />
                </div>

                <div className="grid grid-cols-5 gap-2">
                  <div className="p-2 rounded bg-white/5 text-center">
                    <div className="text-lg font-bold text-white">{currentProgress.total}</div>
                    <div className="text-xs text-white/50">Total</div>
                  </div>
                  <div className="p-2 rounded bg-green-500/20 text-center">
                    <div className="text-lg font-bold text-green-400">{currentProgress.successful}</div>
                    <div className="text-xs text-green-400/70">Success</div>
                  </div>
                  <div className="p-2 rounded bg-red-500/20 text-center">
                    <div className="text-lg font-bold text-red-400">{currentProgress.failed}</div>
                    <div className="text-xs text-red-400/70">Failed</div>
                  </div>
                  <div className="p-2 rounded bg-yellow-500/20 text-center">
                    <div className="text-lg font-bold text-yellow-400">{currentProgress.skipped}</div>
                    <div className="text-xs text-yellow-400/70">Skipped</div>
                  </div>
                  <div className="p-2 rounded bg-purple-500/20 text-center">
                    <div className="text-lg font-bold text-purple-400">{currentBatch.totalChunks || 0}</div>
                    <div className="text-xs text-purple-400/70">Chunks</div>
                  </div>
                </div>

                {currentProgress.failed > 0 && currentBatch.status === 'completed' && (
                  <Button
                    onClick={() => retryMutation.mutate(currentBatch.id)}
                    disabled={retryMutation.isPending}
                    variant="outline"
                    className="gap-2"
                    data-testid="batch-retry-btn"
                  >
                    {retryMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                    Retry Failed Episodes
                  </Button>
                )}
              </>
            )}

            {currentBatch.autoDetect && currentBatch.status === 'classifying' && (
              <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
                <div className="flex items-center gap-2 text-purple-300">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Classifying episodes with AI...</span>
                </div>
              </div>
            )}

            {currentBatch.autoDetect && currentBatch.status === 'pending' && currentEpisodes.some(e => e.primaryNamespace) && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-white/70">Review Classifications:</div>
                  <Button
                    onClick={() => startProcessingMutation.mutate(currentBatch.id)}
                    disabled={startProcessingMutation.isPending}
                    className="gap-2 bg-green-600 hover:bg-green-700"
                    data-testid="start-processing-btn"
                  >
                    {startProcessingMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Play className="w-4 h-4" />
                    )}
                    Start Processing
                  </Button>
                </div>
                <div className="max-h-[300px] overflow-y-auto space-y-2">
                  {currentEpisodes.map(episode => (
                    <div 
                      key={episode.id} 
                      className="p-3 rounded bg-white/5 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-white/80 truncate max-w-[250px] text-sm font-medium">{episode.filename}</span>
                        <div className="flex items-center gap-2">
                          {episode.confidence != null && (
                            <span className={`text-xs ${episode.confidence >= 0.8 ? 'text-green-400' : episode.confidence >= 0.6 ? 'text-yellow-400' : 'text-red-400'}`}>
                              {Math.round(episode.confidence * 100)}% confidence
                            </span>
                          )}
                          {episode.manualOverride && (
                            <Badge variant="outline" className="text-xs">Manual</Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {editingEpisodeId === episode.id ? (
                          <Select
                            value={episode.primaryNamespace || ''}
                            onValueChange={(value) => {
                              updateNamespaceMutation.mutate({ episodeId: episode.id, primaryNamespace: value });
                            }}
                          >
                            <SelectTrigger className="w-[180px] h-8 bg-black/30 border-white/20 text-sm">
                              <SelectValue placeholder="Select namespace..." />
                            </SelectTrigger>
                            <SelectContent>
                              {NAMESPACE_TAXONOMY.map(ns => (
                                <SelectItem key={ns} value={ns}>{ns}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <>
                            {episode.predictedNamespaces?.map(ns => (
                              <Badge key={ns} className="bg-purple-600/50">{ns}</Badge>
                            )) || (
                              <Badge className="bg-gray-600/50">{currentBatch.namespace}</Badge>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditingEpisodeId(episode.id)}
                              className="h-6 w-6 p-0"
                              data-testid={`edit-episode-${episode.id}`}
                            >
                              <Edit2 className="w-3 h-3" />
                            </Button>
                          </>
                        )}
                      </div>
                      {episode.classificationRationale && (
                        <p className="text-xs text-white/40 line-clamp-1">{episode.classificationRationale}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(!currentBatch.autoDetect || currentBatch.status === 'processing' || currentBatch.status === 'completed' || currentBatch.status === 'failed') && currentEpisodes.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm text-white/70">Episodes:</div>
                <div className="max-h-[200px] overflow-y-auto space-y-1">
                  {currentEpisodes.map(episode => (
                    <div 
                      key={episode.id} 
                      className="flex items-center justify-between p-2 rounded bg-white/5 text-sm"
                    >
                      <span className="text-white/80 truncate max-w-[250px]">{episode.filename}</span>
                      <div className="flex items-center gap-2">
                        {episode.predictedNamespaces?.length ? (
                          <span className="text-purple-400 text-xs">{episode.predictedNamespaces.join(', ')}</span>
                        ) : null}
                        {episode.chunksCount !== null && (
                          <span className="text-white/50">{episode.chunksCount} chunks</span>
                        )}
                        {getStatusBadge(episode.status)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {batches.length > 0 && (
        <Card className="glass-strong border-white/10">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg text-white">Recent Batches</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => resumeStuckMutation.mutate()}
                disabled={resumeStuckMutation.isPending}
                className="border-amber-500/50 text-amber-400 hover:bg-amber-500/20"
              >
                {resumeStuckMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                Resume Stuck Batches
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {batches.slice(0, 10).map(batch => (
                <div 
                  key={batch.id}
                  onClick={() => setActiveBatchId(batch.id)}
                  className={`flex items-center justify-between p-3 rounded cursor-pointer transition-colors ${
                    activeBatchId === batch.id ? 'bg-purple-500/20 border border-purple-500/40' : 'bg-white/5 hover:bg-white/10'
                  }`}
                  data-testid={`batch-item-${batch.id}`}
                >
                  <div className="flex-1">
                    <div className="text-white font-medium">{batch.zipFilename}</div>
                    <div className="text-xs text-white/50">
                      {batch.namespace} • {batch.totalEpisodes} episodes • {new Date(batch.createdAt).toLocaleString()}
                      {batch.autoDetect && <span className="text-purple-400 ml-1">• Auto-detect</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {batch.totalChunks && (
                      <span className="text-sm text-purple-400">{batch.totalChunks} chunks</span>
                    )}
                    {getStatusBadge(batch.status)}
                    {(batch.status === 'processing' || batch.status === 'extracting' || batch.status === 'classifying') && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); if (confirm('Cancel this batch? Pending episodes will be skipped.')) cancelBatchMutation.mutate(batch.id); }}
                        disabled={cancelBatchMutation.isPending}
                        className="h-7 w-7 p-0 text-yellow-400 hover:text-yellow-300 hover:bg-yellow-500/20"
                        title="Cancel batch"
                      >
                        <Square className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); if (confirm('Delete this batch and all its episodes? This cannot be undone.')) deleteBatchMutation.mutate(batch.id); }}
                      disabled={deleteBatchMutation.isPending}
                      className="h-7 w-7 p-0 text-red-400 hover:text-red-300 hover:bg-red-500/20"
                      title="Delete batch"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
