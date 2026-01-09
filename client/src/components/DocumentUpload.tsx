import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, FileText, CheckCircle, AlertCircle, Loader2, Video, FileUp, X, Tag, FolderOpen, Archive } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { PINECONE_CATEGORIES, CATEGORY_DESCRIPTIONS, type PineconeCategory } from "@shared/pineconeCategories";
import { GoogleDrivePicker } from "./GoogleDrivePicker";
import { getAdminHeaders } from "@/lib/adminAuth";

interface UploadResult {
  success: boolean;
  documentId: string;
  filename: string;
  fileType: string;
  fileSize: number;
  status: string;
  message: string;
}

interface DocumentUploadProps {
  onUploadComplete?: () => void;
}

interface FileUploadStatus {
  file: File;
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress: string;
  error?: string;
}

export function DocumentUpload({ onUploadComplete }: DocumentUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>("");
  const [selectedFiles, setSelectedFiles] = useState<FileUploadStatus[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<PineconeCategory>("OTHER");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      validateAndSetFiles(files);
    }
  }, []);

  const validateAndSetFiles = (files: File[]) => {
    const validFiles: FileUploadStatus[] = [];
    const invalidFiles: string[] = [];

    files.forEach(file => {
      // Check file type
      const isPDF = file.type === 'application/pdf';
      const isDOCX = file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || file.name.endsWith('.docx');
      const isTXT = file.type === 'text/plain' || file.name.endsWith('.txt');
      const isZIP = file.type === 'application/zip' || file.type === 'application/x-zip-compressed' || file.name.endsWith('.zip');
      const isVideo = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v'].includes(file.type);
      const isAudio = ['audio/mp3', 'audio/mpeg', 'audio/wav', 'audio/m4a', 'audio/webm'].includes(file.type);

      if (!isPDF && !isDOCX && !isTXT && !isZIP && !isVideo && !isAudio) {
        invalidFiles.push(`${file.name} (invalid type)`);
        return;
      }

      // Check file size (max 100MB for videos/audio/zip, 25MB for documents)
      const maxSize = isVideo || isAudio || isZIP ? 100 * 1024 * 1024 : 25 * 1024 * 1024;
      if (file.size > maxSize) {
        invalidFiles.push(`${file.name} (too large)`);
        return;
      }

      validFiles.push({
        file,
        status: 'pending',
        progress: ''
      });
    });

    if (invalidFiles.length > 0) {
      toast({
        title: "Some files were skipped",
        description: `Invalid: ${invalidFiles.join(', ')}`,
        variant: "destructive",
      });
    }

    if (validFiles.length > 0) {
      setSelectedFiles(prev => [...prev, ...validFiles]);
      toast({
        title: `${validFiles.length} file(s) added`,
        description: `Ready to upload ${validFiles.length} file(s)`,
      });
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      validateAndSetFiles(Array.from(files));
    }
  };

  const handleBatchUpload = async () => {
    if (selectedFiles.length === 0) return;

    setIsUploading(true);
    let successCount = 0;
    let errorCount = 0;

    // Process files sequentially to avoid overwhelming the server
    for (let i = 0; i < selectedFiles.length; i++) {
      const fileStatus = selectedFiles[i];
      
      if (fileStatus.status !== 'pending') continue;

      // Update status to uploading
      setSelectedFiles(prev => prev.map((f, idx) => 
        idx === i ? { ...f, status: 'uploading' as const, progress: 'Uploading...' } : f
      ));

      try {
        const formData = new FormData();
        formData.append('file', fileStatus.file);
        formData.append('category', selectedCategory);

        // Determine endpoint based on file type
        const isPDF = fileStatus.file.type === 'application/pdf';
        const isDOCX = fileStatus.file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || fileStatus.file.name.endsWith('.docx');
        const isTXT = fileStatus.file.type === 'text/plain' || fileStatus.file.name.endsWith('.txt');
        const isZIP = fileStatus.file.type === 'application/zip' || fileStatus.file.type === 'application/x-zip-compressed' || fileStatus.file.name.endsWith('.zip');
        
        let endpoint = '/api/documents/upload-video'; // default for video/audio
        if (isPDF) endpoint = '/api/documents/upload-pdf';
        else if (isDOCX) endpoint = '/api/documents/upload-docx';
        else if (isTXT) endpoint = '/api/documents/upload-txt';
        else if (isZIP) endpoint = '/api/documents/upload-zip';

        setUploadProgress(`Processing ${i + 1} of ${selectedFiles.length}: ${fileStatus.file.name}`);

        const response = await fetch(endpoint, {
          method: 'POST',
          body: formData,
          credentials: 'include',
          headers: getAdminHeaders(),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Upload failed' }));
          throw new Error(errorData.error || `Upload failed with status ${response.status}`);
        }

        const result = await response.json();

        if (result.success) {
          setSelectedFiles(prev => prev.map((f, idx) => 
            idx === i ? { ...f, status: 'success' as const, progress: 'Completed' } : f
          ));
          successCount++;
        } else {
          throw new Error(result.error || "Upload failed");
        }
      } catch (error: any) {
        console.error('Upload error:', error);
        setSelectedFiles(prev => prev.map((f, idx) => 
          idx === i ? { 
            ...f, 
            status: 'error' as const, 
            progress: 'Failed', 
            error: error.message 
          } : f
        ));
        errorCount++;
      }
    }

    setIsUploading(false);
    setUploadProgress("");

    // Show summary toast
    toast({
      title: "Batch upload complete",
      description: `✅ ${successCount} succeeded, ❌ ${errorCount} failed`,
      variant: successCount > 0 ? "default" : "destructive",
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    if (onUploadComplete && successCount > 0) {
      onUploadComplete();
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = (file: File) => {
    if (file.type === 'application/pdf') return <FileText className="w-8 h-8 text-red-500" />;
    if (file.type.startsWith('video/')) return <Video className="w-8 h-8 text-purple-500" />;
    if (file.type === 'application/zip' || file.type === 'application/x-zip-compressed' || file.name.endsWith('.zip')) return <Archive className="w-8 h-8 text-amber-500" />;
    return <FileUp className="w-8 h-8 text-blue-500" />;
  };

  return (
    <div className="space-y-6">
      {/* Category Selector - Shared across all upload methods */}
      <Card className="glass-strong border-white/10">
        <CardContent className="pt-6">
          <div className="space-y-2">
            <Label htmlFor="category" className="flex items-center gap-2 text-white">
              <Tag className="w-4 h-4" />
              Knowledge Category
            </Label>
            <select
              id="category"
              data-testid="select-category"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value as PineconeCategory)}
              disabled={isUploading}
              className="flex h-10 w-full items-center justify-between rounded-md border border-white/20 bg-black/40 text-white px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {PINECONE_CATEGORIES.map((category) => (
                <option key={category} value={category} className="bg-black text-white">
                  {category}
                </option>
              ))}
            </select>
            <div className="space-y-1">
              <p className="text-xs text-white/70">
                <span className="font-medium">{selectedCategory}:</span> {CATEGORY_DESCRIPTIONS[selectedCategory]}
              </p>
              <p className="text-xs text-white/50">
                Documents will be saved to this category namespace and accessible to all avatars configured for it.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Upload Methods Tabs */}
      <Tabs defaultValue="local" className="w-full">
        <TabsList className="grid w-full grid-cols-2 glass p-1">
          <TabsTrigger 
            value="local" 
            className="gap-2 data-[state=active]:bg-gradient-primary data-[state=active]:text-white data-[state=active]:glow-primary transition-all"
            data-testid="tab-local-upload"
          >
            <Upload className="w-4 h-4" />
            Local Files
          </TabsTrigger>
          <TabsTrigger 
            value="google-drive" 
            className="gap-2 data-[state=active]:bg-gradient-primary data-[state=active]:text-white data-[state=active]:glow-primary transition-all"
            data-testid="tab-google-drive"
          >
            <FolderOpen className="w-4 h-4" />
            Google Drive
          </TabsTrigger>
        </TabsList>

        <TabsContent value="local" className="space-y-4 mt-6">
          <Card className="glass-strong border-white/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <Upload className="w-5 h-5" />
                Upload Local Files
              </CardTitle>
              <CardDescription className="text-white/70">
                Upload documents (PDF, DOCX, TXT, ZIP) or video/audio files (MP4, MP3, WAV, M4A) from your device
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">

          {/* Drag and drop area */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
              "border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer",
              isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50",
              selectedFiles.length > 0 && "border-primary bg-primary/5"
            )}
            onClick={() => fileInputRef.current?.click()}
            data-testid="dropzone-upload"
          >
            <div className="space-y-2">
              <Upload className="w-12 h-12 mx-auto text-muted-foreground" />
              <div>
                <p className="text-base font-medium text-foreground">
                  Drop files here or click to browse
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Supports PDF, DOCX, TXT, ZIP, MP4, MOV, WebM, MP3, WAV, M4A (multiple files)
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Max size: 25MB for documents, 100MB for videos/audio/ZIP
                </p>
              </div>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.txt,.zip,.mp4,.mov,.webm,.m4v,.mp3,.wav,.m4a"
            onChange={handleFileSelect}
            className="hidden"
            disabled={isUploading}
            multiple
            data-testid="input-file-upload"
          />

          {/* File List */}
          {selectedFiles.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-foreground">
                  Selected Files ({selectedFiles.length})
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedFiles([]);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  disabled={isUploading}
                >
                  Clear All
                </Button>
              </div>
              <div className="max-h-60 overflow-y-auto space-y-2 border rounded-lg p-2 bg-muted/20">
                {selectedFiles.map((fileStatus, idx) => (
                  <div 
                    key={idx} 
                    className="flex items-center justify-between p-2 bg-background rounded border"
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {getFileIcon(fileStatus.file)}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {fileStatus.file.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatFileSize(fileStatus.file.size)} • {fileStatus.progress || 'Ready'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {fileStatus.status === 'success' && (
                        <CheckCircle className="w-5 h-5 text-green-500" />
                      )}
                      {fileStatus.status === 'error' && (
                        <AlertCircle className="w-5 h-5 text-red-500" />
                      )}
                      {fileStatus.status === 'uploading' && (
                        <Loader2 className="w-5 h-5 animate-spin text-primary" />
                      )}
                      {fileStatus.status === 'pending' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedFiles(prev => prev.filter((_, i) => i !== idx));
                          }}
                          disabled={isUploading}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedFiles.length > 0 && (
            <Button
              onClick={handleBatchUpload}
              disabled={isUploading || selectedFiles.every(f => f.status !== 'pending')}
              className="w-full"
              size="lg"
              data-testid="button-upload-batch"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {uploadProgress || "Uploading..."}
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Upload {selectedFiles.filter(f => f.status === 'pending').length} File(s)
                </>
              )}
            </Button>
          )}

          {isUploading && uploadProgress && (
            <div className="flex items-center gap-2 text-sm text-blue-600 bg-blue-50 dark:bg-blue-950 p-3 rounded-lg">
              <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
              <span>{uploadProgress}</span>
            </div>
          )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="google-drive" className="space-y-4 mt-6">
          <GoogleDrivePicker 
            selectedCategory={selectedCategory} 
            onUploadComplete={onUploadComplete} 
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
