import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { FolderOpen, Upload, Check, AlertCircle, Loader2, ChevronDown, ChevronRight, FileText, RefreshCw } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface TopicFolder {
  id: string;
  name: string;
  namespace: string;
  fileCount: number;
  supportedFiles: number;
}

interface FileInfo {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
}

interface UploadStatus {
  folderId: string;
  status: 'idle' | 'uploading' | 'success' | 'error';
  progress: number;
  currentFile: string;
  successCount: number;
  errorCount: number;
  totalFiles: number;
}

export function TopicFolderUpload() {
  const [uploadStatuses, setUploadStatuses] = useState<Record<string, UploadStatus>>({});
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: topicFolders, isLoading, refetch } = useQuery<TopicFolder[]>({
    queryKey: ['/api/google-drive/topic-folders'],
    select: (data: any) => data.folders || [],
  });

  const getFilesQuery = (folderId: string) => useQuery<FileInfo[]>({
    queryKey: ['/api/google-drive/topic-folder', folderId, 'files'],
    enabled: expandedFolders.has(folderId),
    select: (data: any) => data.files || [],
  });

  const uploadSingleFile = async (fileId: string, fileName: string, namespace: string) => {
    const response = await apiRequest('/api/google-drive/topic-upload-single', 'POST', {
      fileId,
      fileName,
      namespace,
    });
    return response;
  };

  const handleUploadFolder = async (folder: TopicFolder) => {
    const status: UploadStatus = {
      folderId: folder.id,
      status: 'uploading',
      progress: 0,
      currentFile: '',
      successCount: 0,
      errorCount: 0,
      totalFiles: folder.supportedFiles,
    };

    setUploadStatuses(prev => ({ ...prev, [folder.id]: status }));

    try {
      // Get admin secret for authentication
      const adminSecret = localStorage.getItem('admin_secret');
      const headers: Record<string, string> = {};
      if (adminSecret) {
        headers['X-Admin-Secret'] = adminSecret;
      }
      
      const filesResponse = await fetch(`/api/google-drive/topic-folder/${folder.id}/files`, {
        credentials: 'include',
        headers,
      });
      const filesData = await filesResponse.json();
      const files: FileInfo[] = filesData.files || [];

      if (files.length === 0) {
        toast({
          title: "No files to upload",
          description: `${folder.name} has no supported files`,
          variant: "default",
        });
        setUploadStatuses(prev => ({
          ...prev,
          [folder.id]: { ...prev[folder.id], status: 'success', progress: 100 }
        }));
        return;
      }

      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        setUploadStatuses(prev => ({
          ...prev,
          [folder.id]: {
            ...prev[folder.id],
            currentFile: file.name,
            progress: Math.round((i / files.length) * 100),
          }
        }));

        try {
          await uploadSingleFile(file.id, file.name, folder.namespace);
          successCount++;
        } catch (error: any) {
          // Handle "file too large" as a skip rather than error
          if (error.message?.includes('too large') || error.message?.includes('413')) {
            console.log(`Skipped ${file.name}: file too large`);
          } else {
            console.error(`Failed to upload ${file.name}:`, error);
          }
          errorCount++;
        }

        setUploadStatuses(prev => ({
          ...prev,
          [folder.id]: {
            ...prev[folder.id],
            successCount,
            errorCount,
          }
        }));

        await new Promise(resolve => setTimeout(resolve, 500));
      }

      setUploadStatuses(prev => ({
        ...prev,
        [folder.id]: {
          ...prev[folder.id],
          status: errorCount === files.length ? 'error' : 'success',
          progress: 100,
          currentFile: '',
        }
      }));

      toast({
        title: "Upload complete",
        description: `${folder.name}: ${successCount} succeeded, ${errorCount} failed`,
        variant: errorCount > 0 ? "destructive" : "default",
      });

      queryClient.invalidateQueries({ queryKey: ['/api/pinecone/stats'] });

    } catch (error: any) {
      setUploadStatuses(prev => ({
        ...prev,
        [folder.id]: {
          ...prev[folder.id],
          status: 'error',
          progress: 0,
        }
      }));

      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload folder",
        variant: "destructive",
      });
    }
  };

  const toggleFolder = (folderId: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const getStatusBadge = (status: UploadStatus | undefined) => {
    if (!status) return null;
    
    switch (status.status) {
      case 'uploading':
        return <Badge variant="secondary" className="gap-1"><Loader2 className="w-3 h-3 animate-spin" />Uploading</Badge>;
      case 'success':
        return <Badge variant="default" className="gap-1 bg-green-600"><Check className="w-3 h-3" />Done</Badge>;
      case 'error':
        return <Badge variant="destructive" className="gap-1"><AlertCircle className="w-3 h-3" />Error</Badge>;
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <Card className="glass-strong border-purple-500/30">
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
          <span className="ml-2 text-white/70">Loading topic folders...</span>
        </CardContent>
      </Card>
    );
  }

  const totalFiles = topicFolders?.reduce((acc, f) => acc + f.supportedFiles, 0) || 0;
  const foldersWithFiles = topicFolders?.filter(f => f.supportedFiles > 0) || [];

  return (
    <Card className="glass-strong border-purple-500/30">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-white">
              <FolderOpen className="w-5 h-5 text-purple-400" />
              Google Drive Topic Folders
            </CardTitle>
            <CardDescription className="text-white/70">
              Upload documents from organized topic folders to their Pinecone namespaces.
              <span className="block text-xs mt-1 text-white/50">Files &gt;3MB and archives (zip/rar) are automatically filtered out for stability.</span>
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="gap-1"
            data-testid="button-refresh-folders"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </Button>
        </div>
        <div className="flex gap-4 mt-2">
          <Badge variant="outline" className="text-purple-400 border-purple-400/50">
            {topicFolders?.length || 0} folders
          </Badge>
          <Badge variant="outline" className="text-cyan-400 border-cyan-400/50">
            {totalFiles} files ready
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] pr-4">
          <div className="space-y-2">
            {foldersWithFiles.map(folder => {
              const status = uploadStatuses[folder.id];
              const isExpanded = expandedFolders.has(folder.id);
              
              return (
                <Collapsible key={folder.id} open={isExpanded} onOpenChange={() => toggleFolder(folder.id)}>
                  <div className="glass p-3 rounded-lg border border-white/10 hover:border-purple-500/30 transition-all">
                    <div className="flex items-center justify-between">
                      <CollapsibleTrigger asChild>
                        <button 
                          className="flex items-center gap-2 text-left flex-1"
                          data-testid={`folder-toggle-${folder.id}`}
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-purple-400" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-white/50" />
                          )}
                          <FolderOpen className="w-4 h-4 text-yellow-400" />
                          <span className="text-white font-medium">{folder.name}</span>
                          <Badge variant="secondary" className="ml-2 text-xs">
                            {folder.namespace.toLowerCase()}
                          </Badge>
                          <span className="text-white/50 text-sm ml-auto mr-4">
                            {folder.supportedFiles} files
                          </span>
                        </button>
                      </CollapsibleTrigger>
                      
                      <div className="flex items-center gap-2">
                        {getStatusBadge(status)}
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={status?.status === 'uploading'}
                          onClick={() => handleUploadFolder(folder)}
                          className="gap-1"
                          data-testid={`button-upload-folder-${folder.id}`}
                        >
                          {status?.status === 'uploading' ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Upload className="w-3 h-3" />
                          )}
                          Upload
                        </Button>
                      </div>
                    </div>

                    {status?.status === 'uploading' && (
                      <div className="mt-3 space-y-1">
                        <Progress value={status.progress} className="h-2" />
                        <div className="flex justify-between text-xs text-white/50">
                          <span>Uploading: {status.currentFile}</span>
                          <span>{status.successCount}/{status.totalFiles}</span>
                        </div>
                      </div>
                    )}

                    <CollapsibleContent className="mt-3">
                      <FolderFiles folderId={folder.id} />
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              );
            })}

            {foldersWithFiles.length === 0 && (
              <div className="text-center py-8 text-white/50">
                <FolderOpen className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No folders with supported files found</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function formatFileSize(bytes: string | undefined): string {
  if (!bytes) return '';
  const size = parseInt(bytes, 10);
  if (isNaN(size)) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function FolderFiles({ folderId }: { folderId: string }) {
  const { data: files, isLoading } = useQuery<FileInfo[]>({
    queryKey: ['/api/google-drive/topic-folder', folderId, 'files'],
    select: (data: any) => data.files || [],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
        <span className="ml-2 text-sm text-white/50">Loading files...</span>
      </div>
    );
  }

  if (!files || files.length === 0) {
    return (
      <div className="text-center py-4 text-white/50 text-sm">
        No files found (large files &gt;3MB and archives are filtered out)
      </div>
    );
  }

  return (
    <div className="space-y-2 pl-6">
      <div className="text-xs text-white/40 mb-2">
        Files under 3MB only (zip/rar excluded)
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {files.slice(0, 10).map(file => (
          <div 
            key={file.id} 
            className="flex items-center gap-2 text-sm text-white/70 py-1"
            data-testid={`file-item-${file.id}`}
          >
            <FileText className="w-3 h-3 text-blue-400 flex-shrink-0" />
            <span className="truncate flex-1">{file.name}</span>
            {file.size && (
              <span className="text-xs text-white/40 flex-shrink-0">
                {formatFileSize(file.size)}
              </span>
            )}
          </div>
        ))}
      </div>
      {files.length > 10 && (
        <div className="text-xs text-white/40">
          +{files.length - 10} more files
        </div>
      )}
    </div>
  );
}
