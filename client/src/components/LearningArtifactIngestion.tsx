import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Upload, CheckCircle2, Info, FileText, FileUp, Lightbulb, Brain, ListChecks, AlertTriangle, HelpCircle, Target, BookOpen } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getAdminHeaders } from "@/lib/adminAuth";

interface LearningArtifact {
  artifact_type: string;
  title: string;
  content: string;
  steps: string[] | null;
  example: string | null;
  topic: string;
  subtopic: string;
  tags: string[];
  confidence: string;
  safety_notes: string | null;
}

interface IngestionResult {
  success: boolean;
  kb: string;
  courseId: string;
  lessonId: string;
  lessonTitle: string;
  totalArtifacts: number;
  artifactsByType: Record<string, number>;
  dryRunPreview?: LearningArtifact[];
  recordsUpserted?: number;
}

interface KbsResponse {
  success: boolean;
  knowledgeBases: string[];
}

const ARTIFACT_TYPE_ICONS: Record<string, typeof Lightbulb> = {
  principle: Lightbulb,
  mental_model: Brain,
  heuristic: Target,
  failure_mode: AlertTriangle,
  checklist: ListChecks,
  qa_pair: HelpCircle,
  scenario: BookOpen,
};

const ARTIFACT_TYPE_COLORS: Record<string, string> = {
  principle: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  mental_model: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  heuristic: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  failure_mode: "bg-red-500/20 text-red-400 border-red-500/30",
  checklist: "bg-green-500/20 text-green-400 border-green-500/30",
  qa_pair: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  scenario: "bg-orange-500/20 text-orange-400 border-orange-500/30",
};

export function LearningArtifactIngestion() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [ingestionMode, setIngestionMode] = useState<"single" | "full">("single");
  const [kb, setKb] = useState<string>("");
  const [courseId, setCourseId] = useState<string>("");
  const [lessonId, setLessonId] = useState<string>("");
  const [lessonTitle, setLessonTitle] = useState<string>("");
  const [courseTitle, setCourseTitle] = useState<string>("");
  const [rawText, setRawText] = useState<string>("");
  const [dryRun, setDryRun] = useState<boolean>(true);
  const [lastResult, setLastResult] = useState<IngestionResult | null>(null);
  const [fullCourseResult, setFullCourseResult] = useState<any>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string>("");
  const [isExtracting, setIsExtracting] = useState(false);
  
  // Background job tracking
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<any>(null);
  const [isPolling, setIsPolling] = useState(false);

  const { data: kbsData } = useQuery<KbsResponse>({
    queryKey: ['/api/admin/learning-artifacts/kbs'],
    queryFn: async () => {
      const response = await fetch('/api/admin/learning-artifacts/kbs', {
        headers: getAdminHeaders()
      });
      if (!response.ok) throw new Error('Failed to fetch knowledge bases');
      return response.json();
    }
  });

  const knowledgeBases = kbsData?.knowledgeBases || [];

  const ingestMutation = useMutation({
    mutationFn: async (data: {
      kb: string;
      courseId: string;
      lessonId: string;
      lessonTitle?: string;
      rawText: string;
      dryRun?: boolean;
    }) => {
      const response = await fetch('/api/admin/learning-artifacts/ingest', {
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
    onSuccess: (data) => {
      setLastResult(data);
      queryClient.invalidateQueries({ queryKey: ['/api/pinecone/stats'] });
      
      if (data.dryRunPreview) {
        toast({
          title: "Dry Run Complete",
          description: `Preview: ${data.totalArtifacts} learning artifacts would be created`,
        });
      } else {
        toast({
          title: "Ingestion Complete",
          description: `Created ${data.recordsUpserted} learning artifacts in ${data.kb.toUpperCase()}`,
        });
        setRawText("");
        setLessonId("");
        setLessonTitle("");
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

  // Poll for job status when we have an active job
  useEffect(() => {
    if (!activeJobId || !isPolling) return;
    
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/admin/learning-artifacts/job/${activeJobId}`, {
          headers: getAdminHeaders()
        });
        
        if (!response.ok) {
          console.error('Failed to poll job status');
          return;
        }
        
        const data = await response.json();
        setJobStatus(data.job);
        
        // Check if job is complete or failed
        if (data.job.status === 'completed') {
          setIsPolling(false);
          setFullCourseResult(data.job.result);
          queryClient.invalidateQueries({ queryKey: ['/api/pinecone/stats'] });
          toast({
            title: "Full Course Ingestion Complete",
            description: `Processed ${data.job.lessonsProcessed} lessons, created ${data.job.totalArtifacts} artifacts`,
          });
          setRawText("");
          setCourseTitle("");
          setUploadedFileName("");
        } else if (data.job.status === 'failed') {
          setIsPolling(false);
          const errorMsg = data.job.errors?.[0]?.error || 'Unknown error';
          toast({
            title: "Full Course Ingestion Failed",
            description: errorMsg,
            variant: "destructive"
          });
        }
      } catch (error) {
        console.error('Error polling job status:', error);
      }
    }, 2000); // Poll every 2 seconds
    
    return () => clearInterval(pollInterval);
  }, [activeJobId, isPolling, queryClient, toast]);

  const fullCourseMutation = useMutation({
    mutationFn: async (data: {
      kb: string;
      courseId: string;
      courseTitle?: string;
      rawText: string;
      dryRun?: boolean;
    }) => {
      const response = await fetch('/api/admin/learning-artifacts/ingest-full-course', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAdminHeaders()
        },
        body: JSON.stringify(data)
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Full course ingestion failed');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      if (data.jobId) {
        // Background job started - begin polling
        setActiveJobId(data.jobId);
        setJobStatus({ status: 'detecting', lessonsDetected: 0, lessonsProcessed: 0 });
        setIsPolling(true);
        toast({
          title: "Processing Started",
          description: "Detecting lessons in course transcript...",
        });
      } else {
        // Immediate result (shouldn't happen with new API but handle for safety)
        setFullCourseResult(data);
        queryClient.invalidateQueries({ queryKey: ['/api/pinecone/stats'] });
        
        if (data.dryRun) {
          toast({
            title: "Lesson Detection Complete",
            description: `Detected ${data.detectedLessons?.length || 0} lessons in "${data.courseTitle}"`,
          });
        } else {
          toast({
            title: "Full Course Ingestion Complete",
            description: `Processed ${data.lessonsProcessed} lessons, created ${data.totalArtifacts} artifacts`,
          });
          setRawText("");
          setCourseTitle("");
          setUploadedFileName("");
        }
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Full Course Ingestion Failed",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsExtracting(true);
    setUploadedFileName(file.name);

    try {
      const text = await file.text();
      setRawText(text);
      
      const fileNameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
      if (!lessonId) {
        setLessonId(fileNameWithoutExt.toLowerCase().replace(/\s+/g, '_'));
      }
      if (!lessonTitle) {
        setLessonTitle(fileNameWithoutExt);
      }
      
      toast({
        title: "File Loaded",
        description: `Loaded ${file.name} (${text.length.toLocaleString()} characters)`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to read file",
        variant: "destructive"
      });
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSubmit = () => {
    if (!kb || !courseId || !lessonId || !rawText.trim()) {
      toast({
        title: "Missing Fields",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }

    ingestMutation.mutate({
      kb,
      courseId,
      lessonId,
      lessonTitle: lessonTitle || undefined,
      rawText,
      dryRun
    });
  };

  const handleFullCourseSubmit = (overrideDryRun?: boolean) => {
    if (!kb || !courseId || !rawText.trim()) {
      toast({
        title: "Missing Fields",
        description: "Please fill in Knowledge Base, Course ID, and paste the course transcript",
        variant: "destructive"
      });
      return;
    }

    // Use override if provided (for "Process All Lessons" button), otherwise use state
    const effectiveDryRun = overrideDryRun !== undefined ? overrideDryRun : dryRun;

    fullCourseMutation.mutate({
      kb,
      courseId,
      courseTitle: courseTitle || undefined,
      rawText,
      dryRun: effectiveDryRun
    });
  };

  const getArtifactIcon = (type: string) => {
    const Icon = ARTIFACT_TYPE_ICONS[type] || Lightbulb;
    return <Icon className="w-4 h-4" />;
  };

  return (
    <div className="space-y-6">
      <Card className="glass-strong border-white/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Brain className="w-5 h-5 text-purple-400" />
            Learning Artifact Ingestion
          </CardTitle>
          <CardDescription className="text-white/60">
            Transform course transcripts into derived learning artifacts (principles, mental models, heuristics, etc.) - NOT verbatim text.
            This is safer for copyright and more useful for retrieval.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Tabs value={ingestionMode} onValueChange={(v) => setIngestionMode(v as "single" | "full")}>
            <TabsList className="grid grid-cols-2 w-full max-w-md">
              <TabsTrigger value="single" className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Single Lesson
              </TabsTrigger>
              <TabsTrigger value="full" className="flex items-center gap-2">
                <BookOpen className="w-4 h-4" />
                Full Course (Auto-Detect)
              </TabsTrigger>
            </TabsList>

            <TabsContent value="single" className="space-y-6 mt-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-white/80">Knowledge Base *</Label>
                  <Select value={kb} onValueChange={setKb}>
                    <SelectTrigger className="glass border-white/20 text-white">
                      <SelectValue placeholder="Select knowledge base" />
                    </SelectTrigger>
                    <SelectContent>
                      {knowledgeBases.map((kbName) => (
                        <SelectItem key={kbName} value={kbName}>
                          {kbName.charAt(0).toUpperCase() + kbName.slice(1).replace(/_/g, ' ')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-white/50">
                    Namespace in Pinecone where artifacts will be stored
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="text-white/80">Course ID *</Label>
                  <Input
                    value={courseId}
                    onChange={(e) => setCourseId(e.target.value)}
                    placeholder="e.g., psychedelics_101"
                    className="glass border-white/20 text-white placeholder:text-white/40"
                  />
                  <p className="text-xs text-white/50">
                    Unique identifier for the course
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-white/80">Lesson ID *</Label>
                  <Input
                    value={lessonId}
                    onChange={(e) => setLessonId(e.target.value)}
                    placeholder="e.g., lesson_01_intro"
                    className="glass border-white/20 text-white placeholder:text-white/40"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-white/80">Lesson Title</Label>
                  <Input
                    value={lessonTitle}
                    onChange={(e) => setLessonTitle(e.target.value)}
                    placeholder="e.g., Introduction to Set and Setting"
                    className="glass border-white/20 text-white placeholder:text-white/40"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-white/80">Transcript Text *</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      ref={fileInputRef}
                      accept=".txt,.md,.srt,.vtt"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isExtracting}
                      className="glass border-white/20 text-white/80 hover:text-white"
                    >
                      {isExtracting ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <FileUp className="w-4 h-4 mr-2" />
                      )}
                      {uploadedFileName || "Upload File"}
                    </Button>
                  </div>
                </div>
                <Textarea
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder="Paste the lesson transcript here..."
                  className="glass border-white/20 text-white placeholder:text-white/40 min-h-[200px] font-mono text-sm"
                />
                <p className="text-xs text-white/50">
                  {rawText.length.toLocaleString()} characters
                </p>
              </div>

              <div className="flex items-center justify-between p-4 rounded-lg glass border border-white/10">
                <div className="flex items-center gap-3">
                  <Switch
                    id="dry-run"
                    checked={dryRun}
                    onCheckedChange={setDryRun}
                  />
                  <div>
                    <Label htmlFor="dry-run" className="text-white/80 cursor-pointer">
                      Dry Run Mode
                    </Label>
                    <p className="text-xs text-white/50">
                      Preview artifacts without saving to Pinecone
                    </p>
                  </div>
                </div>

                <Button
                  onClick={handleSubmit}
                  disabled={ingestMutation.isPending || !kb || !courseId || !lessonId || !rawText.trim()}
                  className="bg-gradient-primary hover:opacity-90"
                >
                  {ingestMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      {dryRun ? "Preview Artifacts" : "Ingest Artifacts"}
                    </>
                  )}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="full" className="space-y-6 mt-6">
              <div className="p-4 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-200 text-sm">
                <strong>Auto-Lesson Detection:</strong> Paste a full course transcript and the system will automatically 
                detect individual lessons based on headings, markers, and topic transitions. Each lesson will be 
                processed separately for artifact extraction.
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-white/80">Knowledge Base *</Label>
                  <Select value={kb} onValueChange={setKb}>
                    <SelectTrigger className="glass border-white/20 text-white">
                      <SelectValue placeholder="Select knowledge base" />
                    </SelectTrigger>
                    <SelectContent>
                      {knowledgeBases.map((kbName) => (
                        <SelectItem key={kbName} value={kbName}>
                          {kbName.charAt(0).toUpperCase() + kbName.slice(1).replace(/_/g, ' ')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-white/80">Course ID *</Label>
                  <Input
                    value={courseId}
                    onChange={(e) => setCourseId(e.target.value)}
                    placeholder="e.g., psychedelics_mastery"
                    className="glass border-white/20 text-white placeholder:text-white/40"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-white/80">Course Title (Optional)</Label>
                <Input
                  value={courseTitle}
                  onChange={(e) => setCourseTitle(e.target.value)}
                  placeholder="e.g., Complete Guide to Psychedelic Integration"
                  className="glass border-white/20 text-white placeholder:text-white/40"
                />
                <p className="text-xs text-white/50">
                  If not provided, will be auto-detected from the transcript
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-white/80">Full Course Transcript *</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      ref={fileInputRef}
                      accept=".txt,.md,.srt,.vtt"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isExtracting}
                      className="glass border-white/20 text-white/80 hover:text-white"
                    >
                      {isExtracting ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <FileUp className="w-4 h-4 mr-2" />
                      )}
                      {uploadedFileName || "Upload File"}
                    </Button>
                  </div>
                </div>
                <Textarea
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder="Paste the FULL course transcript here (all lessons combined). The system will automatically detect lesson boundaries..."
                  className="glass border-white/20 text-white placeholder:text-white/40 min-h-[250px] font-mono text-sm"
                />
                <p className="text-xs text-white/50">
                  {rawText.length.toLocaleString()} characters
                </p>
              </div>

              <div className="flex items-center justify-between p-4 rounded-lg glass border border-white/10">
                <div className="flex items-center gap-3">
                  <Switch
                    id="dry-run-full"
                    checked={dryRun}
                    onCheckedChange={setDryRun}
                  />
                  <div>
                    <Label htmlFor="dry-run-full" className="text-white/80 cursor-pointer">
                      Dry Run Mode
                    </Label>
                    <p className="text-xs text-white/50">
                      Detect lessons and preview without processing
                    </p>
                  </div>
                </div>

                <Button
                  onClick={() => handleFullCourseSubmit()}
                  disabled={fullCourseMutation.isPending || isPolling || !kb || !courseId || !rawText.trim()}
                  className="bg-gradient-primary hover:opacity-90"
                >
                  {fullCourseMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Starting...
                    </>
                  ) : isPolling ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {jobStatus?.status === 'detecting' ? 'Detecting Lessons...' : 
                       `Processing ${jobStatus?.lessonsProcessed || 0}/${jobStatus?.lessonsDetected || '?'} lessons...`}
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      {dryRun ? "Detect Lessons" : "Process Full Course"}
                    </>
                  )}
                </Button>
                
                {/* Progress indicator for background job */}
                {isPolling && jobStatus && (
                  <div className="mt-4 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                      <span className="text-blue-400 font-medium">
                        {jobStatus.status === 'detecting' ? 'Detecting lessons...' :
                         jobStatus.status === 'processing' ? `Processing lesson ${jobStatus.lessonsProcessed + 1} of ${jobStatus.lessonsDetected}` :
                         'Processing...'}
                      </span>
                    </div>
                    {jobStatus.courseTitle && (
                      <p className="text-sm text-white/60 mb-2">Course: {jobStatus.courseTitle}</p>
                    )}
                    {jobStatus.currentLesson && (
                      <p className="text-sm text-white/60 mb-2">Current: {jobStatus.currentLesson}</p>
                    )}
                    {jobStatus.lessonsDetected > 0 && (
                      <div className="w-full bg-white/10 rounded-full h-2">
                        <div 
                          className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                          style={{ width: `${(jobStatus.lessonsProcessed / jobStatus.lessonsDetected) * 100}%` }}
                        />
                      </div>
                    )}
                    {jobStatus.totalArtifacts > 0 && (
                      <p className="text-xs text-white/40 mt-2">{jobStatus.totalArtifacts} artifacts created so far</p>
                    )}
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {fullCourseResult && ingestionMode === "full" && (
        <Card className="glass-strong border-white/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <CheckCircle2 className="w-5 h-5 text-green-400" />
              {fullCourseResult.dryRun ? "Detected Lessons Preview" : "Full Course Results"}
            </CardTitle>
            <CardDescription className="text-white/60">
              {fullCourseResult.courseTitle} - {fullCourseResult.detectedLessons?.length || 0} lessons detected
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {fullCourseResult.detectedLessons && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-white/80">Detected Lessons:</h4>
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                  {fullCourseResult.detectedLessons.map((lesson: any, i: number) => (
                    <div key={i} className="p-3 rounded-lg glass border border-white/10">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-xs">{lesson.lessonId}</Badge>
                        <span className="font-medium text-white">{lesson.lessonTitle}</span>
                      </div>
                      <p className="text-xs text-white/50 line-clamp-2">{lesson.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!fullCourseResult.dryRun && (
              <div className="grid grid-cols-4 gap-4">
                <div className="p-3 rounded-lg glass border border-white/10 text-center">
                  <div className="text-2xl font-bold text-white">{fullCourseResult.totalArtifacts}</div>
                  <div className="text-xs text-white/50">Total Artifacts</div>
                </div>
                {Object.entries(fullCourseResult.artifactsByType || {})
                  .filter(([_, count]) => (count as number) > 0)
                  .map(([type, count]) => (
                    <div key={type} className={`p-3 rounded-lg border ${ARTIFACT_TYPE_COLORS[type] || 'glass border-white/10'} text-center`}>
                      <div className="text-2xl font-bold">{count as number}</div>
                      <div className="text-xs capitalize">{type.replace(/_/g, ' ')}</div>
                    </div>
                  ))
                }
              </div>
            )}

            {fullCourseResult.dryRun && (
              <div className="flex justify-end pt-4 border-t border-white/10">
                <Button
                  onClick={() => {
                    setDryRun(false);
                    handleFullCourseSubmit(false); // Explicitly pass false to bypass async state update
                  }}
                  disabled={fullCourseMutation.isPending || isPolling}
                  className="bg-gradient-primary hover:opacity-90"
                >
                  {isPolling ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Processing {jobStatus?.lessonsProcessed || 0}/{jobStatus?.lessonsDetected || fullCourseResult.detectedLessons?.length || 0}...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      Process All {fullCourseResult.detectedLessons?.length || 0} Lessons
                    </>
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {lastResult && ingestionMode === "single" && (
        <Card className="glass-strong border-white/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <CheckCircle2 className="w-5 h-5 text-green-400" />
              {lastResult.dryRunPreview ? "Dry Run Preview" : "Ingestion Results"}
            </CardTitle>
            <CardDescription className="text-white/60">
              {lastResult.lessonTitle} ({lastResult.lessonId})
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-4 gap-4">
              <div className="p-3 rounded-lg glass border border-white/10 text-center">
                <div className="text-2xl font-bold text-white">{lastResult.totalArtifacts}</div>
                <div className="text-xs text-white/50">Total Artifacts</div>
              </div>
              {Object.entries(lastResult.artifactsByType)
                .filter(([_, count]) => count > 0)
                .map(([type, count]) => (
                  <div key={type} className={`p-3 rounded-lg border ${ARTIFACT_TYPE_COLORS[type] || 'glass border-white/10'} text-center`}>
                    <div className="text-2xl font-bold">{count}</div>
                    <div className="text-xs capitalize">{type.replace(/_/g, ' ')}</div>
                  </div>
                ))
              }
            </div>

            {lastResult.dryRunPreview && lastResult.dryRunPreview.length > 0 && (
              <div className="space-y-3 mt-6">
                <h4 className="text-sm font-medium text-white/80 flex items-center gap-2">
                  <Info className="w-4 h-4" />
                  Sample Artifacts (first 10)
                </h4>
                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                  {lastResult.dryRunPreview.map((artifact, i) => (
                    <div key={i} className={`p-4 rounded-lg border ${ARTIFACT_TYPE_COLORS[artifact.artifact_type] || 'glass border-white/10'}`}>
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded-lg bg-black/20">
                          {getArtifactIcon(artifact.artifact_type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="text-xs capitalize">
                              {artifact.artifact_type.replace(/_/g, ' ')}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {artifact.confidence}
                            </Badge>
                          </div>
                          <h5 className="font-semibold text-white mb-2">{artifact.title}</h5>
                          <p className="text-sm text-white/80 mb-2">{artifact.content}</p>
                          
                          {artifact.steps && artifact.steps.length > 0 && (
                            <ul className="list-disc list-inside text-sm text-white/70 mb-2">
                              {artifact.steps.map((step, j) => (
                                <li key={j}>{step}</li>
                              ))}
                            </ul>
                          )}
                          
                          {artifact.example && (
                            <p className="text-sm text-white/60 italic mb-2">
                              Example: {artifact.example}
                            </p>
                          )}
                          
                          <div className="flex flex-wrap gap-1 mt-2">
                            {artifact.tags.slice(0, 5).map((tag, j) => (
                              <Badge key={j} variant="secondary" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                            {artifact.tags.length > 5 && (
                              <Badge variant="secondary" className="text-xs">
                                +{artifact.tags.length - 5}
                              </Badge>
                            )}
                          </div>
                          
                          {artifact.safety_notes && (
                            <div className="mt-2 p-2 rounded bg-red-500/10 border border-red-500/20 text-xs text-red-300">
                              <AlertTriangle className="w-3 h-3 inline mr-1" />
                              {artifact.safety_notes}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {lastResult.dryRunPreview && (
              <div className="flex justify-end pt-4 border-t border-white/10">
                <Button
                  onClick={() => {
                    setDryRun(false);
                    handleSubmit();
                  }}
                  disabled={ingestMutation.isPending}
                  className="bg-gradient-primary hover:opacity-90"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Proceed with Ingestion
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="glass-strong border-white/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white text-lg">
            <Lightbulb className="w-5 h-5 text-yellow-400" />
            How Learning Artifacts Work
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-white/70">
          <p>
            Unlike traditional transcript ingestion, this system <strong className="text-white">synthesizes</strong> your course content into 
            reusable learning artifacts. Each artifact is written in our voice, not quoted from the source.
          </p>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 rounded-lg glass border border-white/10">
              <div className="flex items-center gap-2 mb-2 text-yellow-400">
                <Lightbulb className="w-4 h-4" />
                <strong>Principles</strong>
              </div>
              <p className="text-xs">Core truths and fundamental concepts</p>
            </div>
            <div className="p-3 rounded-lg glass border border-white/10">
              <div className="flex items-center gap-2 mb-2 text-purple-400">
                <Brain className="w-4 h-4" />
                <strong>Mental Models</strong>
              </div>
              <p className="text-xs">Frameworks for thinking about things</p>
            </div>
            <div className="p-3 rounded-lg glass border border-white/10">
              <div className="flex items-center gap-2 mb-2 text-cyan-400">
                <Target className="w-4 h-4" />
                <strong>Heuristics</strong>
              </div>
              <p className="text-xs">Rules of thumb and quick decision guides</p>
            </div>
            <div className="p-3 rounded-lg glass border border-white/10">
              <div className="flex items-center gap-2 mb-2 text-red-400">
                <AlertTriangle className="w-4 h-4" />
                <strong>Failure Modes</strong>
              </div>
              <p className="text-xs">Common mistakes and traps to avoid</p>
            </div>
            <div className="p-3 rounded-lg glass border border-white/10">
              <div className="flex items-center gap-2 mb-2 text-green-400">
                <ListChecks className="w-4 h-4" />
                <strong>Checklists</strong>
              </div>
              <p className="text-xs">Step-by-step procedures</p>
            </div>
            <div className="p-3 rounded-lg glass border border-white/10">
              <div className="flex items-center gap-2 mb-2 text-blue-400">
                <HelpCircle className="w-4 h-4" />
                <strong>Q&A Pairs</strong>
              </div>
              <p className="text-xs">Question and answer format for common queries</p>
            </div>
          </div>
          
          <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-300">
            <strong>Benefits:</strong> No direct quotes, no copyright issues, better retrieval, 
            reusable across contexts, maintains your platform's voice.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
