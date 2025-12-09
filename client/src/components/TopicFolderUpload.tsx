import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { FolderOpen, Upload, Check, AlertCircle, Loader2, ChevronDown, ChevronRight, FileText, RefreshCw, CheckSquare, Square } from "lucide-react";
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
  uploadable?: boolean;
  skipReason?: string | null;
  fileSizeFormatted?: string;
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
  const [selectedFiles, setSelectedFiles] = useState<Record<string, Set<string>>>({}); // folderId -> Set of fileIds
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const toggleFileSelection = (folderId: string, fileId: string) => {
    setSelectedFiles(prev => {
      const folderSelections = new Set(prev[folderId] || []);
      if (folderSelections.has(fileId)) {
        folderSelections.delete(fileId);
      } else {
        folderSelections.add(fileId);
      }
      return { ...prev, [folderId]: folderSelections };
    });
  };

  const selectAllFiles = (folderId: string, fileIds: string[]) => {
    setSelectedFiles(prev => ({
      ...prev,
      [folderId]: new Set(fileIds),
    }));
  };

  const deselectAllFiles = (folderId: string) => {
    setSelectedFiles(prev => ({
      ...prev,
      [folderId]: new Set(),
    }));
  };

  const getSelectedCount = (folderId: string) => {
    return selectedFiles[folderId]?.size || 0;
  };

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

  const handleUploadSelected = async (folder: TopicFolder, filesToUpload: FileInfo[]) => {
    if (filesToUpload.length === 0) {
      toast({
        title: "No files selected",
        description: "Please select files to upload",
        variant: "default",
      });
      return;
    }

    const status: UploadStatus = {
      folderId: folder.id,
      status: 'uploading',
      progress: 0,
      currentFile: '',
      successCount: 0,
      errorCount: 0,
      totalFiles: filesToUpload.length,
    };

    setUploadStatuses(prev => ({ ...prev, [folder.id]: status }));

    let successCount = 0;
    let errorCount = 0;

    try {
      for (let i = 0; i < filesToUpload.length; i++) {
        const file = filesToUpload[i];
        
        setUploadStatuses(prev => ({
          ...prev,
          [folder.id]: {
            ...prev[folder.id],
            currentFile: file.name,
            progress: Math.round((i / filesToUpload.length) * 100),
          }
        }));

        try {
          await uploadSingleFile(file.id, file.name, folder.namespace);
          successCount++;
        } catch (error: any) {
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
          status: errorCount === filesToUpload.length ? 'error' : 'success',
          progress: 100,
          currentFile: '',
        }
      }));

      // Clear selections after upload
      deselectAllFiles(folder.id);

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
        description: error.message || "Failed to upload files",
        variant: "destructive",
      });
    }
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
      const allFiles: FileInfo[] = filesData.files || [];
      
      // Only upload files that are marked as uploadable
      const files = allFiles.filter(f => f.uploadable !== false);

      if (files.length === 0) {
        toast({
          title: "No files to upload",
          description: `${folder.name} has no supported files (${allFiles.length} files skipped due to size or type)`,
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
  // Show all folders, sorted by name - folders with 0 files will show a message
  const sortedFolders = [...(topicFolders || [])].sort((a, b) => a.name.localeCompare(b.name));

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
              <span className="block text-xs mt-1 text-white/50">Click on a folder to expand and select files. Files &gt;15MB are automatically filtered out.</span>
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ['/api/google-drive/topic-folders'] });
              refetch();
            }}
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
            {sortedFolders.map(folder => {
              const status = uploadStatuses[folder.id];
              const isExpanded = expandedFolders.has(folder.id);
              const hasFiles = folder.supportedFiles > 0;
              
              return (
                <Collapsible key={folder.id} open={isExpanded} onOpenChange={() => toggleFolder(folder.id)}>
                  <div className={`glass p-3 rounded-lg border transition-all ${hasFiles ? 'border-white/10 hover:border-purple-500/30' : 'border-white/5 opacity-60'}`}>
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
                          <FolderOpen className={`w-4 h-4 ${hasFiles ? 'text-yellow-400' : 'text-white/30'}`} />
                          <span className={`font-medium ${hasFiles ? 'text-white' : 'text-white/50'}`}>{folder.name}</span>
                          <Badge variant="secondary" className="ml-2 text-xs">
                            {folder.namespace.toLowerCase()}
                          </Badge>
                          <span className={`text-sm ml-auto mr-4 ${hasFiles ? 'text-white/50' : 'text-white/30'}`}>
                            {folder.supportedFiles} files
                          </span>
                        </button>
                      </CollapsibleTrigger>
                      
                      <div className="flex items-center gap-2">
                        {getStatusBadge(status)}
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={status?.status === 'uploading' || !hasFiles}
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
                      {hasFiles ? (
                        <FolderFiles 
                          folderId={folder.id}
                          folder={folder}
                          selectedFiles={selectedFiles[folder.id] || new Set()}
                          onToggleFile={(fileId) => toggleFileSelection(folder.id, fileId)}
                          onSelectAll={(fileIds) => selectAllFiles(folder.id, fileIds)}
                          onDeselectAll={() => deselectAllFiles(folder.id)}
                          onUploadSelected={(files) => handleUploadSelected(folder, files)}
                          isUploading={uploadStatuses[folder.id]?.status === 'uploading'}
                        />
                      ) : (
                        <div className="text-center py-4 text-white/40 text-sm">
                          No uploadable files (all files may be &gt;15MB or archives)
                        </div>
                      )}
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              );
            })}

            {sortedFolders.length === 0 && (
              <div className="text-center py-8 text-white/50">
                <FolderOpen className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No topic folders found</p>
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

interface FolderFilesProps {
  folderId: string;
  folder: TopicFolder;
  selectedFiles: Set<string>;
  onToggleFile: (fileId: string) => void;
  onSelectAll: (fileIds: string[]) => void;
  onDeselectAll: () => void;
  onUploadSelected: (files: FileInfo[]) => void;
  isUploading: boolean;
}

function FolderFiles({ 
  folderId, 
  folder,
  selectedFiles, 
  onToggleFile, 
  onSelectAll, 
  onDeselectAll,
  onUploadSelected,
  isUploading,
}: FolderFilesProps) {
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
        No files found in this folder
      </div>
    );
  }

  const uploadableFiles = files.filter(f => f.uploadable !== false);
  const skippedFiles = files.filter(f => f.uploadable === false);
  const selectedCount = selectedFiles.size;
  const allSelected = selectedCount === uploadableFiles.length && uploadableFiles.length > 0;
  const someSelected = selectedCount > 0 && selectedCount < uploadableFiles.length;

  const handleSelectAll = () => {
    if (allSelected) {
      onDeselectAll();
    } else {
      onSelectAll(uploadableFiles.map(f => f.id));
    }
  };

  const handleUploadSelected = () => {
    const filesToUpload = uploadableFiles.filter(f => selectedFiles.has(f.id));
    onUploadSelected(filesToUpload);
  };

  return (
    <div className="space-y-3 pl-6">
      {/* Selection controls */}
      {uploadableFiles.length > 0 && (
        <div className="flex items-center justify-between border-b border-white/10 pb-2">
          <div className="flex items-center gap-3">
            <button
              onClick={handleSelectAll}
              className="flex items-center gap-2 text-sm text-white/70 hover:text-white transition-colors"
              data-testid={`button-select-all-${folderId}`}
            >
              {allSelected ? (
                <CheckSquare className="w-4 h-4 text-purple-400" />
              ) : someSelected ? (
                <Square className="w-4 h-4 text-purple-400/50" />
              ) : (
                <Square className="w-4 h-4 text-white/40" />
              )}
              {allSelected ? 'Deselect All' : 'Select All'}
            </button>
            {selectedCount > 0 && (
              <Badge variant="secondary" className="text-xs">
                {selectedCount} selected
              </Badge>
            )}
          </div>
          {selectedCount > 0 && (
            <Button
              size="sm"
              variant="default"
              disabled={isUploading}
              onClick={handleUploadSelected}
              className="gap-1 bg-purple-600 hover:bg-purple-700"
              data-testid={`button-upload-selected-${folderId}`}
            >
              {isUploading ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Upload className="w-3 h-3" />
              )}
              Upload {selectedCount} Selected
            </Button>
          )}
        </div>
      )}

      {/* Uploadable files section */}
      {uploadableFiles.length > 0 && (
        <div>
          <div className="text-xs text-green-400/70 mb-2 flex items-center gap-1">
            <Check className="w-3 h-3" />
            Ready to upload ({uploadableFiles.length})
          </div>
          <div className="grid grid-cols-1 gap-1">
            {uploadableFiles.map(file => (
              <div 
                key={file.id} 
                className={`flex items-center gap-2 text-sm py-1.5 px-2 rounded cursor-pointer transition-colors ${
                  selectedFiles.has(file.id) 
                    ? 'bg-purple-500/20 text-white' 
                    : 'text-white/70 hover:bg-white/5'
                }`}
                onClick={() => onToggleFile(file.id)}
                data-testid={`file-item-${file.id}`}
              >
                <Checkbox
                  checked={selectedFiles.has(file.id)}
                  onCheckedChange={() => onToggleFile(file.id)}
                  className="data-[state=checked]:bg-purple-500 data-[state=checked]:border-purple-500"
                  data-testid={`checkbox-file-${file.id}`}
                />
                <FileText className="w-3 h-3 text-blue-400 flex-shrink-0" />
                <span className="truncate flex-1">{file.name}</span>
                <span className="text-xs text-white/40 flex-shrink-0">
                  {file.fileSizeFormatted || formatFileSize(file.size)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Skipped files section */}
      {skippedFiles.length > 0 && (
        <div>
          <div className="text-xs text-orange-400/70 mb-2 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            Skipped ({skippedFiles.length})
          </div>
          <div className="grid grid-cols-1 gap-1">
            {skippedFiles.slice(0, 5).map(file => (
              <div 
                key={file.id} 
                className="flex items-center gap-2 text-sm text-white/40 py-1"
                data-testid={`file-skipped-${file.id}`}
              >
                <FileText className="w-3 h-3 text-white/30 flex-shrink-0" />
                <span className="truncate flex-1">{file.name}</span>
                <span className="text-xs text-orange-400/50 flex-shrink-0">
                  {file.skipReason || 'Not supported'}
                </span>
              </div>
            ))}
          </div>
          {skippedFiles.length > 5 && (
            <div className="text-xs text-white/30 mt-1">
              +{skippedFiles.length - 5} more skipped files
            </div>
          )}
        </div>
      )}
    </div>
  );
}
