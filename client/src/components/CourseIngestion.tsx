import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Loader2, Upload, AlertTriangle, CheckCircle2, Info, Trash2, BarChart3 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getAdminHeaders } from "@/lib/adminAuth";

interface ConversationalChunk {
  text: string;
  content_type: string;
  tone: string;
  topic: string;
  confidence: string;
  voice_origin: string;
  attribution?: string;
}

interface IngestionResult {
  success: boolean;
  avatar: string;
  source: string;
  totalChunks: number;
  chunksByType: Record<string, number>;
  chunksByNamespace: Record<string, number>;
  discardedCount: number;
  dryRunPreview?: ConversationalChunk[];
}

interface NamespaceStats {
  success: boolean;
  avatar: string;
  namespaces: Record<string, { vectorCount: number }>;
}

interface AvatarOption {
  id: string;
  name: string;
}

const PROTECTED_AVATARS = ['mark-kohl', 'markkohl'];

function isProtectedAvatar(avatar: string): boolean {
  const normalized = avatar.toLowerCase().replace(/[^a-z0-9]/g, '');
  return PROTECTED_AVATARS.some(p => 
    p.toLowerCase().replace(/[^a-z0-9]/g, '') === normalized
  );
}

export function CourseIngestion() {
  const { toast } = useToast();
  const [selectedAvatar, setSelectedAvatar] = useState<string>("");
  const [source, setSource] = useState<string>("");
  const [rawText, setRawText] = useState<string>("");
  const [attribution, setAttribution] = useState<string>("");
  const [dryRun, setDryRun] = useState<boolean>(true);
  const [lastResult, setLastResult] = useState<IngestionResult | null>(null);

  const { data: avatars = [] } = useQuery<AvatarOption[]>({
    queryKey: ['/api/admin/avatars'],
  });

  const availableAvatars = avatars.filter(a => !isProtectedAvatar(a.id));

  const { data: namespaceStats, refetch: refetchStats } = useQuery<NamespaceStats>({
    queryKey: ['/admin/course/stats', selectedAvatar],
    enabled: !!selectedAvatar,
    queryFn: async () => {
      const response = await fetch(`/admin/course/stats/${selectedAvatar}`, {
        headers: getAdminHeaders()
      });
      if (!response.ok) throw new Error('Failed to fetch stats');
      return response.json();
    }
  });

  const ingestMutation = useMutation({
    mutationFn: async (data: {
      avatar: string;
      source: string;
      rawText: string;
      attribution?: string;
      dryRun?: boolean;
    }) => {
      const response = await fetch('/admin/course/ingest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAdminHeaders()
        },
        body: JSON.stringify(data)
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Ingestion failed');
      }
      
      return response.json() as Promise<IngestionResult>;
    },
    onSuccess: (result) => {
      setLastResult(result);
      
      if (result.dryRunPreview) {
        toast({
          title: "Dry Run Complete",
          description: `Would create ${result.totalChunks} chunks across ${Object.keys(result.chunksByNamespace).length} namespaces`
        });
      } else {
        toast({
          title: "Ingestion Complete",
          description: `Created ${result.totalChunks} chunks, ${result.discardedCount} discarded`
        });
        setRawText("");
        setSource("");
        refetchStats();
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Ingestion Failed",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (avatar: string) => {
      const response = await fetch(`/admin/course/namespace/${avatar}`, {
        method: 'DELETE',
        headers: getAdminHeaders()
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Deletion failed');
      }
      
      return response.json();
    },
    onSuccess: (result) => {
      toast({
        title: "Namespaces Deleted",
        description: `Deleted: ${result.deleted?.join(', ') || 'none'}`
      });
      refetchStats();
    },
    onError: (error: Error) => {
      toast({
        title: "Deletion Failed",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const handleIngest = useCallback(() => {
    if (!selectedAvatar || !source || !rawText) {
      toast({
        title: "Missing Required Fields",
        description: "Please select an avatar, enter a source name, and paste your transcript",
        variant: "destructive"
      });
      return;
    }
    
    ingestMutation.mutate({
      avatar: selectedAvatar,
      source,
      rawText,
      attribution: attribution || undefined,
      dryRun
    });
  }, [selectedAvatar, source, rawText, attribution, dryRun, ingestMutation, toast]);

  const handleDelete = useCallback(() => {
    if (!selectedAvatar) return;
    
    if (window.confirm(`Are you sure you want to delete ALL namespaces for ${selectedAvatar}? This cannot be undone.`)) {
      deleteMutation.mutate(selectedAvatar);
    }
  }, [selectedAvatar, deleteMutation]);

  const totalVectors = namespaceStats?.namespaces 
    ? Object.values(namespaceStats.namespaces).reduce((sum, ns) => sum + ns.vectorCount, 0)
    : 0;

  return (
    <div className="space-y-6">
      <Card className="glass-strong border-purple-500/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Upload className="w-5 h-5" />
            Course Transcript Ingestion
          </CardTitle>
          <CardDescription className="text-white/70">
            Paste course transcripts to anonymize, chunk conversationally, and route to the correct namespace.
            Mark Kohl's namespace is protected and cannot be modified.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-white">Avatar</Label>
              <Select value={selectedAvatar} onValueChange={setSelectedAvatar}>
                <SelectTrigger data-testid="select-avatar-ingestion">
                  <SelectValue placeholder="Select avatar..." />
                </SelectTrigger>
                <SelectContent>
                  {availableAvatars.map(avatar => (
                    <SelectItem key={avatar.id} value={avatar.id}>
                      {avatar.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label className="text-white">Source Identifier</Label>
              <Input
                data-testid="input-source-identifier"
                placeholder="e.g., course_sexuality_module1"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="bg-white/5 border-white/20 text-white"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-white">Attribution (Optional)</Label>
            <Input
              data-testid="input-attribution"
              placeholder="e.g., alan_watts (leaves voice_origin as attributed)"
              value={attribution}
              onChange={(e) => setAttribution(e.target.value)}
              className="bg-white/5 border-white/20 text-white"
            />
            <p className="text-xs text-white/50">
              If set, chunks will have voice_origin: "attributed" instead of "avatar_native"
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-white">Raw Transcript</Label>
            <Textarea
              data-testid="textarea-raw-transcript"
              placeholder="Paste your raw course transcript here..."
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              className="min-h-[200px] bg-white/5 border-white/20 text-white font-mono text-sm"
            />
            <div className="flex justify-between text-xs text-white/50">
              <span>{rawText.length.toLocaleString()} characters</span>
              <span>~{Math.ceil(rawText.length / 4).toLocaleString()} tokens (estimate)</span>
            </div>
          </div>

          <div className="flex items-center justify-between p-4 rounded-lg bg-white/5 border border-white/10">
            <div className="flex items-center gap-3">
              <Switch
                id="dry-run"
                checked={dryRun}
                onCheckedChange={setDryRun}
                data-testid="switch-dry-run"
              />
              <Label htmlFor="dry-run" className="text-white cursor-pointer">
                Dry Run Mode
              </Label>
            </div>
            <div className="flex items-center gap-2 text-sm text-white/60">
              <Info className="w-4 h-4" />
              {dryRun ? "Preview without saving" : "Will save to Pinecone"}
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              onClick={handleIngest}
              disabled={ingestMutation.isPending || !selectedAvatar || !source || rawText.length < 100}
              className="flex-1 bg-gradient-primary"
              data-testid="button-ingest"
            >
              {ingestMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : dryRun ? (
                "Preview Ingestion"
              ) : (
                "Ingest Transcript"
              )}
            </Button>
            
            {selectedAvatar && (
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
                data-testid="button-delete-namespace"
              >
                {deleteMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {selectedAvatar && namespaceStats && (
        <Card className="glass-strong border-white/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg text-white flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Namespace Stats for {selectedAvatar}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-5 gap-4">
              {Object.entries(namespaceStats.namespaces).map(([ns, stats]) => (
                <div key={ns} className="p-3 rounded-lg bg-white/5 border border-white/10">
                  <div className="text-xs text-white/50 mb-1">{ns.split('_').pop()}</div>
                  <div className="text-2xl font-bold text-white">{stats.vectorCount}</div>
                  <div className="text-xs text-white/40">vectors</div>
                </div>
              ))}
            </div>
            <div className="mt-4 text-sm text-white/60">
              Total: {totalVectors.toLocaleString()} vectors
            </div>
          </CardContent>
        </Card>
      )}

      {lastResult && (
        <Card className="glass-strong border-white/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg text-white flex items-center gap-2">
              {lastResult.dryRunPreview ? (
                <Info className="w-5 h-5 text-blue-400" />
              ) : (
                <CheckCircle2 className="w-5 h-5 text-green-400" />
              )}
              {lastResult.dryRunPreview ? "Dry Run Preview" : "Ingestion Results"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="p-3 rounded-lg bg-white/5">
                <div className="text-xs text-white/50 mb-1">Total Chunks</div>
                <div className="text-2xl font-bold text-white">{lastResult.totalChunks}</div>
              </div>
              <div className="p-3 rounded-lg bg-white/5">
                <div className="text-xs text-white/50 mb-1">Discarded</div>
                <div className="text-2xl font-bold text-amber-400">{lastResult.discardedCount}</div>
              </div>
              <div className="p-3 rounded-lg bg-white/5">
                <div className="text-xs text-white/50 mb-1">Namespaces</div>
                <div className="text-2xl font-bold text-white">
                  {Object.keys(lastResult.chunksByNamespace).length}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm text-white/70 font-medium">By Content Type</div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(lastResult.chunksByType).map(([type, count]) => (
                  <Badge key={type} variant="secondary" className="bg-white/10 text-white">
                    {type}: {count}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm text-white/70 font-medium">By Namespace</div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(lastResult.chunksByNamespace).map(([ns, count]) => (
                  <Badge key={ns} variant="outline" className="border-purple-500/50 text-purple-300">
                    {ns}: {count}
                  </Badge>
                ))}
              </div>
            </div>

            {lastResult.dryRunPreview && lastResult.dryRunPreview.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm text-white/70 font-medium">Sample Chunks (first 10)</div>
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {lastResult.dryRunPreview.map((chunk, idx) => (
                    <div 
                      key={idx} 
                      className="p-3 rounded-lg bg-white/5 border border-white/10 space-y-2"
                    >
                      <div className="flex flex-wrap gap-1">
                        <Badge variant="secondary" className="bg-purple-500/20 text-purple-300 text-xs">
                          {chunk.content_type}
                        </Badge>
                        <Badge variant="secondary" className="bg-blue-500/20 text-blue-300 text-xs">
                          {chunk.tone}
                        </Badge>
                        <Badge variant="secondary" className="bg-green-500/20 text-green-300 text-xs">
                          {chunk.confidence}
                        </Badge>
                        <Badge variant="outline" className="border-white/20 text-white/60 text-xs">
                          {chunk.topic}
                        </Badge>
                      </div>
                      <p className="text-sm text-white/80 leading-relaxed">{chunk.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="glass-strong border-amber-500/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg text-amber-400 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            Ingestion Guidelines
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-white/70 space-y-2">
          <p>This pipeline will automatically:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li><strong>Anonymize</strong> - Remove names, places, dates, career markers, unique phrases</li>
            <li><strong>Chunk conversationally</strong> - Create 120-300 token standalone units</li>
            <li><strong>Classify</strong> - Tag each chunk with content_type, tone, topic, confidence</li>
            <li><strong>Route</strong> - Send chunks to _core, _stories, _advice, _warnings namespaces</li>
            <li><strong>Discard</strong> - Remove lesson intros, CTAs, structural glue, repetition</li>
          </ul>
          <p className="mt-3 text-amber-400/80">
            Always do a dry run first to preview results before committing to Pinecone.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
