import { useState, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, Upload, AlertTriangle, CheckCircle2, Info, Trash2, BarChart3, FileText, FileUp } from "lucide-react";
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
  namespace: string;
  source: string;
  totalChunks: number;
  chunksByType: Record<string, number>;
  discardedCount: number;
  dryRunPreview?: ConversationalChunk[];
}

interface NamespaceStats {
  namespace: string;
  vectorCount: number;
}

interface NamespaceResponse {
  totalVectorCount: number;
  dimension: number;
  namespaces: NamespaceStats[];
}

const PROTECTED_NAMESPACES = ['mark-kohl', 'markkohl', 'mark_kohl'];

function isProtectedNamespace(namespace: string): boolean {
  const normalized = namespace.toLowerCase().replace(/[^a-z0-9]/g, '');
  return PROTECTED_NAMESPACES.some(p => 
    normalized.includes(p.replace(/[^a-z0-9]/g, ''))
  );
}

export function CourseIngestion() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedNamespace, setSelectedNamespace] = useState<string>("");
  const [customNamespace, setCustomNamespace] = useState<string>("");
  const [source, setSource] = useState<string>("");
  const [rawText, setRawText] = useState<string>("");
  const [attribution, setAttribution] = useState<string>("");
  const [dryRun, setDryRun] = useState<boolean>(true);
  const [lastResult, setLastResult] = useState<IngestionResult | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string>("");
  const [isExtracting, setIsExtracting] = useState(false);

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

  const ingestMutation = useMutation({
    mutationFn: async (data: {
      namespace: string;
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
          description: `Would create ${result.totalChunks} chunks in namespace "${targetNamespace}"`
        });
      } else {
        toast({
          title: "Ingestion Complete",
          description: `Created ${result.totalChunks} chunks, ${result.discardedCount} discarded`
        });
        setRawText("");
        setSource("");
        setUploadedFileName("");
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
    mutationFn: async (namespace: string) => {
      const response = await fetch(`/admin/course/namespace/${encodeURIComponent(namespace)}`, {
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
        title: "Namespace Cleared",
        description: `Deleted vectors from: ${result.deleted?.join(', ') || targetNamespace}`
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Deletion Failed",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const validTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      '.docx', '.pdf', '.txt'
    ];

    const isValidType = validTypes.some(type => 
      file.type === type || file.name.toLowerCase().endsWith(type)
    );

    if (!isValidType) {
      toast({
        title: "Invalid File Type",
        description: "Please upload a PDF, DOCX, or TXT file",
        variant: "destructive"
      });
      return;
    }

    setIsExtracting(true);
    setUploadedFileName(file.name);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const adminHeaders = getAdminHeaders();
      console.log('[CourseIngestion] Uploading file:', file.name, 'Admin secret present:', !!adminHeaders['X-Admin-Secret']);
      
      const response = await fetch('/api/admin/course/extract-text', {
        method: 'POST',
        headers: adminHeaders,
        body: formData
      });

      console.log('[CourseIngestion] Response status:', response.status);

      if (!response.ok) {
        let errorMessage = 'Text extraction failed';
        try {
          const error = await response.json();
          errorMessage = error.message || error.error || errorMessage;
        } catch {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
        if (response.status === 401) {
          errorMessage = 'Admin secret mismatch. Please clear your browser storage and re-enter the correct admin secret. Run in console: localStorage.removeItem("admin_secret") then refresh.';
        }
        throw new Error(errorMessage);
      }

      const result = await response.json();
      console.log('[CourseIngestion] Extraction successful:', result.characterCount, 'chars');
      setRawText(result.text);
      
      if (!source) {
        const baseName = file.name.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9]/g, '_');
        setSource(baseName);
      }

      toast({
        title: "File Processed",
        description: `Extracted ${result.text.length.toLocaleString()} characters from ${file.name}`
      });
    } catch (error) {
      console.error('[CourseIngestion] Upload error:', error);
      toast({
        title: "Extraction Failed",
        description: (error as Error).message || 'Unknown error occurred',
        variant: "destructive"
      });
      setUploadedFileName("");
    } finally {
      setIsExtracting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [toast, source]);

  const handleIngest = useCallback(() => {
    if (!targetNamespace || !source || !rawText) {
      toast({
        title: "Missing Required Fields",
        description: "Please select/enter a namespace, enter a source name, and provide transcript content",
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
    
    ingestMutation.mutate({
      namespace: targetNamespace,
      source,
      rawText,
      attribution: attribution || undefined,
      dryRun
    });
  }, [targetNamespace, source, rawText, attribution, dryRun, ingestMutation, toast]);

  const handleDelete = useCallback(() => {
    if (!targetNamespace) return;

    if (isProtectedNamespace(targetNamespace)) {
      toast({
        title: "Protected Namespace",
        description: "This namespace is protected and cannot be deleted",
        variant: "destructive"
      });
      return;
    }
    
    if (window.confirm(`Are you sure you want to delete ALL vectors in "${targetNamespace}"? This cannot be undone.`)) {
      deleteMutation.mutate(targetNamespace);
    }
  }, [targetNamespace, deleteMutation, toast]);

  const selectedNsStats = availableNamespaces.find(ns => ns.namespace === selectedNamespace);

  return (
    <div className="space-y-6">
      <Card className="glass-strong border-purple-500/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Upload className="w-5 h-5" />
            Course Transcript Ingestion
          </CardTitle>
          <CardDescription className="text-white/70">
            Upload or paste course transcripts to anonymize, chunk conversationally, and ingest to a namespace.
            Mark Kohl's namespace is protected and cannot be modified.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-white">Target Namespace</Label>
              <Select value={selectedNamespace} onValueChange={(v) => { setSelectedNamespace(v); setCustomNamespace(""); }}>
                <SelectTrigger data-testid="select-namespace-ingestion">
                  <SelectValue placeholder="Select existing namespace..." />
                </SelectTrigger>
                <SelectContent className="z-[9999] max-h-[300px] overflow-y-auto bg-zinc-900 border border-zinc-700">
                  {availableNamespaces.length === 0 ? (
                    <SelectItem value="_empty" disabled>No namespaces found</SelectItem>
                  ) : (
                    availableNamespaces.map(ns => (
                      <SelectItem key={ns.namespace} value={ns.namespace}>
                        {ns.namespace} ({ns.vectorCount} vectors)
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <div className="text-xs text-white/50">Or enter a new namespace name below</div>
              <Input
                data-testid="input-custom-namespace"
                placeholder="e.g., thad_core, june_stories"
                value={customNamespace}
                onChange={(e) => { setCustomNamespace(e.target.value); setSelectedNamespace(""); }}
                className="bg-white/5 border-white/20 text-white"
              />
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

          <div className="space-y-3">
            <Label className="text-white">Content Source</Label>
            
            <div className="flex gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                onChange={handleFileUpload}
                className="hidden"
                data-testid="input-file-upload"
              />
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={isExtracting}
                className="gap-2"
                data-testid="button-upload-file"
              >
                {isExtracting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Extracting...
                  </>
                ) : (
                  <>
                    <FileUp className="w-4 h-4" />
                    Upload File (PDF, DOCX, TXT)
                  </>
                )}
              </Button>
              {uploadedFileName && (
                <Badge variant="secondary" className="gap-1">
                  <FileText className="w-3 h-3" />
                  {uploadedFileName}
                </Badge>
              )}
            </div>

            <Textarea
              data-testid="textarea-raw-transcript"
              placeholder="Paste your raw course transcript here, or upload a file above..."
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
              disabled={ingestMutation.isPending || !targetNamespace || !source || rawText.length < 100}
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
            
            {targetNamespace && (
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deleteMutation.isPending || isProtectedNamespace(targetNamespace)}
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

          {selectedNsStats && (
            <div className="p-3 rounded-lg bg-white/5 border border-white/10">
              <div className="text-sm text-white/70">
                Selected namespace has <span className="font-bold text-white">{selectedNsStats.vectorCount.toLocaleString()}</span> vectors
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {lastResult && (
        <Card className="glass-strong border-white/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg text-white flex items-center gap-2">
              {lastResult.dryRunPreview ? (
                <AlertTriangle className="w-5 h-5 text-yellow-400" />
              ) : (
                <CheckCircle2 className="w-5 h-5 text-green-400" />
              )}
              {lastResult.dryRunPreview ? "Dry Run Preview" : "Ingestion Results"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="p-3 rounded-lg bg-white/5">
                <div className="text-xs text-white/50 mb-1">Target Namespace</div>
                <div className="text-lg font-bold text-white">{lastResult.namespace}</div>
              </div>
              <div className="p-3 rounded-lg bg-white/5">
                <div className="text-xs text-white/50 mb-1">Total Chunks</div>
                <div className="text-lg font-bold text-white">{lastResult.totalChunks}</div>
              </div>
              <div className="p-3 rounded-lg bg-white/5">
                <div className="text-xs text-white/50 mb-1">Discarded</div>
                <div className="text-lg font-bold text-white">{lastResult.discardedCount}</div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm text-white/70">Chunks by Content Type:</div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(lastResult.chunksByType).map(([type, count]) => (
                  <Badge key={type} variant="secondary" className="gap-1">
                    {type}: {count}
                  </Badge>
                ))}
              </div>
            </div>

            {lastResult.dryRunPreview && lastResult.dryRunPreview.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm text-white/70">Sample Chunks (first 5):</div>
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {lastResult.dryRunPreview.slice(0, 5).map((chunk, i) => (
                    <div key={i} className="p-3 rounded-lg bg-white/5 border border-white/10">
                      <div className="flex gap-2 mb-2 flex-wrap">
                        <Badge variant="outline">{chunk.content_type}</Badge>
                        <Badge variant="outline">{chunk.tone}</Badge>
                        <Badge variant="outline">{chunk.confidence}</Badge>
                        <Badge variant="secondary">{chunk.topic}</Badge>
                      </div>
                      <p className="text-sm text-white/80 line-clamp-3">{chunk.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="glass-strong border-yellow-500/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-yellow-400 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Ingestion Guidelines
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-white/60 space-y-1">
          <p>This pipeline will automatically:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li><strong>Anonymize</strong> - Remove names, places, dates, career markers, unique phrases</li>
            <li><strong>Chunk conversationally</strong> - Create 120-300 token standalone units</li>
            <li><strong>Classify</strong> - Tag each chunk with content_type, tone, topic, confidence</li>
            <li><strong>Discard</strong> - Remove lesson intros, CTAs, structural glue, repetition</li>
          </ul>
          <p className="text-yellow-400/80 mt-3">Always do a dry run first to preview results before committing to Pinecone.</p>
        </CardContent>
      </Card>
    </div>
  );
}
