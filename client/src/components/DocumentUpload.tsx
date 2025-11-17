import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, FileText, CheckCircle, AlertCircle, Loader2, Video, FileUp, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

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

export function DocumentUpload({ onUploadComplete }: DocumentUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
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

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      validateAndSetFile(file);
    }
  }, []);

  const validateAndSetFile = (file: File) => {
    // Check file type
    const isPDF = file.type === 'application/pdf';
    const isVideo = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v'].includes(file.type);
    const isAudio = ['audio/mp3', 'audio/mpeg', 'audio/wav', 'audio/m4a', 'audio/webm'].includes(file.type);

    if (!isPDF && !isVideo && !isAudio) {
      toast({
        title: "Invalid file type",
        description: "Please upload PDF files or video/audio files (MP4, MOV, WebM, MP3, WAV, M4A).",
        variant: "destructive",
      });
      return;
    }

    // Check file size (max 100MB for videos, 25MB for PDFs)
    const maxSize = isVideo || isAudio ? 100 * 1024 * 1024 : 25 * 1024 * 1024;
    if (file.size > maxSize) {
      toast({
        title: "File too large",
        description: `Please upload files smaller than ${isVideo || isAudio ? '100MB' : '25MB'}.`,
        variant: "destructive",
      });
      return;
    }

    setSelectedFile(file);
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      validateAndSetFile(file);
    }
  };

  const handleFileUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setUploadProgress("Uploading file...");

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      // Determine endpoint based on file type
      const isPDF = selectedFile.type === 'application/pdf';
      const endpoint = isPDF ? '/api/documents/upload-pdf' : '/api/documents/upload-video';

      setUploadProgress(isPDF ? "Extracting text from PDF..." : "Transcribing audio...");

      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(errorData.error || `Upload failed with status ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        toast({
          title: "Upload successful",
          description: `${selectedFile.name} has been uploaded and is being processed.`,
        });
        
        setSelectedFile(null);
        setUploadProgress("");
        
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }

        if (onUploadComplete) {
          onUploadComplete();
        }
      } else {
        throw new Error(result.error || "Upload failed");
      }
    } catch (error: any) {
      console.error('Upload error:', error);
      toast({
        title: "Upload failed",
        description: error.message || "An error occurred while uploading the file.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      setUploadProgress("");
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
    return <FileUp className="w-8 h-8 text-blue-500" />;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="w-5 h-5" />
          Upload Documents & Videos
        </CardTitle>
        <CardDescription>
          Upload PDF documents or video/audio files to add knowledge to your AI avatars
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
              selectedFile && "border-primary bg-primary/5"
            )}
            onClick={() => fileInputRef.current?.click()}
            data-testid="dropzone-upload"
          >
            {selectedFile ? (
              <div className="space-y-4">
                <div className="flex items-center justify-center">
                  {getFileIcon(selectedFile)}
                </div>
                <div>
                  <p className="font-medium text-foreground">{selectedFile.name}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {formatFileSize(selectedFile.size)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  disabled={isUploading}
                  data-testid="button-clear-file"
                >
                  <X className="w-4 h-4 mr-1" />
                  Remove
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <Upload className="w-12 h-12 mx-auto text-muted-foreground" />
                <div>
                  <p className="text-base font-medium text-foreground">
                    Drop files here or click to browse
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Supports PDF, MP4, MOV, WebM, MP3, WAV, M4A
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Max size: 25MB for PDFs, 100MB for videos
                  </p>
                </div>
              </div>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.mp4,.mov,.webm,.m4v,.mp3,.wav,.m4a"
            onChange={handleFileSelect}
            className="hidden"
            disabled={isUploading}
            data-testid="input-file-upload"
          />

          {selectedFile && (
            <Button
              onClick={handleFileUpload}
              disabled={isUploading}
              className="w-full"
              size="lg"
              data-testid="button-upload-document"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {uploadProgress || "Uploading..."}
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Upload & Process
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
  );
}
