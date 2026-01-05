import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Loader2, Upload, AlertTriangle, CheckCircle2, XCircle, Package, RefreshCw, FileArchive, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getAdminHeaders } from "@/lib/adminAuth";

interface PodcastEpisode {
  id: string;
  filename: string;
  status: string;
  chunksCount: number | null;
  discardedCount: number | null;
  error: string | null;
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

export function BatchPodcastIngestion() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedNamespace, setSelectedNamespace] = useState<string>("");
  const [customNamespace, setCustomNamespace] = useState<string>("");
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

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
    queryKey: ['/admin/podcast/batches'],
    queryFn: async () => {
      const response = await fetch('/admin/podcast/batches', {
        headers: getAdminHeaders()
      });
      if (!response.ok) throw new Error('Failed to fetch batches');
      return response.json();
    },
    refetchInterval: 10000
  });

  const { data: batchStatus, isLoading: isLoadingStatus } = useQuery<{ success: boolean } & BatchStatusResult>({
    queryKey: ['/admin/podcast/batch', activeBatchId],
    queryFn: async () => {
      if (!activeBatchId) return null;
      const response = await fetch(`/admin/podcast/batch/${activeBatchId}`, {
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
      queryClient.invalidateQueries({ queryKey: ['/admin/podcast/batches'] });
    }
  }, [batchStatus?.batch?.status, queryClient]);

  const retryMutation = useMutation({
    mutationFn: async (batchId: string) => {
      const response = await fetch(`/admin/podcast/batch/${batchId}/retry`, {
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
      queryClient.invalidateQueries({ queryKey: ['/admin/podcast/batch', activeBatchId] });
    },
    onError: (error: Error) => {
      toast({
        title: "Retry Failed",
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

      const response = await fetch('/admin/podcast/batch/upload', {
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
      
      toast({
        title: "Batch Upload Started",
        description: `Processing ${result.totalEpisodes} episodes from ${file.name}`
      });

      queryClient.invalidateQueries({ queryKey: ['/admin/podcast/batches'] });
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
  }, [targetNamespace, toast, queryClient]);

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

          {targetNamespace && (
            <div className="flex items-center gap-4">
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip"
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
              <span className="text-sm text-white/50">
                Target: <span className="text-purple-400 font-medium">{targetNamespace}</span>
              </span>
            </div>
          )}
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
                    <span className="text-white">{currentProgress.processed}/{currentProgress.total} episodes ({currentProgress.percentage}%)</span>
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

            {currentEpisodes.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm text-white/70">Episodes:</div>
                <div className="max-h-[200px] overflow-y-auto space-y-1">
                  {currentEpisodes.map(episode => (
                    <div 
                      key={episode.id} 
                      className="flex items-center justify-between p-2 rounded bg-white/5 text-sm"
                    >
                      <span className="text-white/80 truncate max-w-[300px]">{episode.filename}</span>
                      <div className="flex items-center gap-2">
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
            <CardTitle className="text-lg text-white">Recent Batches</CardTitle>
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
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {batch.totalChunks && (
                      <span className="text-sm text-purple-400">{batch.totalChunks} chunks</span>
                    )}
                    {getStatusBadge(batch.status)}
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
