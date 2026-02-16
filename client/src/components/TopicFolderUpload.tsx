import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { FolderOpen, Upload, Check, AlertCircle, Loader2, ChevronDown, ChevronRight, FileText, RefreshCw, CheckSquare, Square, CheckCircle2, Circle, CloudOff, AlertTriangle, ShieldCheck, Sparkles } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

const PERSONAL_KNOWLEDGE_PATTERNS = [
  'markkohl', 'williegault',
];

function isPersonalNamespace(namespace: string): boolean {
  const normalized = namespace.toLowerCase().replace(/[^a-z0-9]/g, '');
  return PERSONAL_KNOWLEDGE_PATTERNS.some(p => normalized.includes(p));
}

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

interface ArtifactProcessingStatus {
  folderId: string;
  status: 'idle' | 'processing' | 'success' | 'error';
  progress: number;
  currentFile: string;
  successCount: number;
  errorCount: number;
  totalFiles: number;
  totalArtifacts: number;
}

interface FolderIngestionStatus {
  uploaded: number;
  total: number;
  loading: boolean;
}

export function TopicFolderUpload() {
  const [uploadStatuses, setUploadStatuses] = useState<Record<string, UploadStatus>>({});
  const [artifactStatuses, setArtifactStatuses] = useState<Record<string, ArtifactProcessingStatus>>({});
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [selectedFiles, setSelectedFiles] = useState<Record<string, Set<string>>>({}); // folderId -> Set of fileIds
  const [isBulkUploading, setIsBulkUploading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0, currentFolder: '' });
  const [folderIngestionStatuses, setFolderIngestionStatuses] = useState<Record<string, FolderIngestionStatus>>({});
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isCheckingAllStatuses, setIsCheckingAllStatuses] = useState(false);

  const updateFolderIngestionStatus = useCallback((folderId: string, status: FolderIngestionStatus) => {
    setFolderIngestionStatuses(prev => ({ ...prev, [folderId]: status }));
  }, []);

  const handleCheckAllStatuses = async () => {
    if (!topicFolders || topicFolders.length === 0) return;
    setIsCheckingAllStatuses(true);

    const adminSecret = localStorage.getItem('admin_secret');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (adminSecret) headers['X-Admin-Secret'] = adminSecret;

    try {
      for (const folder of topicFolders) {
        if (folder.supportedFiles === 0) {
          setFolderIngestionStatuses(prev => ({ 
            ...prev, 
            [folder.id]: { uploaded: 0, total: 0, loading: false } 
          }));
          continue;
        }

        setFolderIngestionStatuses(prev => ({ 
          ...prev, 
          [folder.id]: { uploaded: 0, total: folder.supportedFiles, loading: true } 
        }));

        try {
          const filesRes = await fetch(`/api/google-drive/topic-folder/${folder.id}/files`, {
            credentials: 'include',
            headers,
          });
          const filesData = await filesRes.json();
          const allFiles: FileInfo[] = filesData.files || [];
          const uploadableFiles = allFiles.filter(f => f.uploadable !== false);

          if (uploadableFiles.length === 0) {
            setFolderIngestionStatuses(prev => ({
              ...prev,
              [folder.id]: { uploaded: 0, total: 0, loading: false }
            }));
            continue;
          }

          const checkRes = await fetch('/api/pinecone/check-existing-files', {
            method: 'POST',
            credentials: 'include',
            headers,
            body: JSON.stringify({
              namespace: folder.namespace,
              fileIds: uploadableFiles.map(f => f.id)
            })
          });
          const checkData = await checkRes.json();
          const existingCount = checkData.existingFileIds?.length || 0;

          setFolderIngestionStatuses(prev => ({
            ...prev,
            [folder.id]: { uploaded: existingCount, total: uploadableFiles.length, loading: false }
          }));
        } catch (err) {
          setFolderIngestionStatuses(prev => ({
            ...prev,
            [folder.id]: { uploaded: 0, total: folder.supportedFiles, loading: false }
          }));
        }
      }
    } finally {
      setIsCheckingAllStatuses(false);
    }
  };

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


  const uploadSingleFile = async (fileId: string, fileName: string, namespace: string) => {
    const response = await apiRequest('/api/google-drive/topic-upload-single', 'POST', {
      fileId,
      fileName,
      namespace,
    });
    return response;
  };

  const uploadSingleFileAsArtifact = async (fileId: string, fileName: string, namespace: string) => {
    const response = await apiRequest('/api/google-drive/topic-upload-artifacts', 'POST', {
      fileId,
      fileName,
      namespace,
    });
    return response;
  };

  const handleProcessAsArtifacts = async (folder: TopicFolder) => {
    const status: ArtifactProcessingStatus = {
      folderId: folder.id,
      status: 'processing',
      progress: 0,
      currentFile: 'Loading files...',
      successCount: 0,
      errorCount: 0,
      totalFiles: folder.supportedFiles,
      totalArtifacts: 0,
    };

    setArtifactStatuses(prev => ({ ...prev, [folder.id]: status }));

    try {
      const adminSecret = localStorage.getItem('admin_secret');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (adminSecret) headers['X-Admin-Secret'] = adminSecret;

      const filesResponse = await fetch(`/api/google-drive/topic-folder/${folder.id}/files`, {
        credentials: 'include',
        headers,
      });
      const filesData = await filesResponse.json();
      const allFiles: FileInfo[] = filesData.files || [];
      const uploadableFiles = allFiles.filter(f => f.uploadable !== false);

      if (uploadableFiles.length === 0) {
        setArtifactStatuses(prev => ({
          ...prev,
          [folder.id]: { ...prev[folder.id], status: 'success', progress: 100, currentFile: '' }
        }));
        toast({ title: "No files to process", description: `${folder.name} has no supported files` });
        return;
      }

      setArtifactStatuses(prev => ({
        ...prev,
        [folder.id]: { ...prev[folder.id], totalFiles: uploadableFiles.length }
      }));

      let successCount = 0;
      let errorCount = 0;
      let skippedCount = 0;
      let totalArtifacts = 0;

      for (let i = 0; i < uploadableFiles.length; i++) {
        const file = uploadableFiles[i];

        setArtifactStatuses(prev => ({
          ...prev,
          [folder.id]: {
            ...prev[folder.id],
            currentFile: file.name,
            progress: Math.round((i / uploadableFiles.length) * 100),
          }
        }));

        try {
          const result: any = await uploadSingleFileAsArtifact(file.id, file.name, folder.namespace);
          if (result.alreadyExists) {
            skippedCount++;
          } else if (result.skipped) {
            skippedCount++;
          } else {
            successCount++;
            totalArtifacts += result.totalArtifacts || 0;
          }
        } catch (error: any) {
          console.error(`Failed to process ${file.name} as artifacts:`, error);
          errorCount++;
        }

        setArtifactStatuses(prev => ({
          ...prev,
          [folder.id]: { ...prev[folder.id], successCount, errorCount, totalArtifacts }
        }));

        await new Promise(resolve => setTimeout(resolve, 500));
      }

      setArtifactStatuses(prev => ({
        ...prev,
        [folder.id]: {
          ...prev[folder.id],
          status: errorCount === uploadableFiles.length && successCount === 0 && skippedCount === 0 ? 'error' : 'success',
          progress: 100,
          currentFile: '',
        }
      }));

      const parts = [];
      if (successCount > 0) parts.push(`${successCount} processed, ${totalArtifacts} artifacts`);
      if (skippedCount > 0) parts.push(`${skippedCount} already existed`);
      if (errorCount > 0) parts.push(`${errorCount} failed`);

      toast({
        title: "Artifact Processing Complete",
        description: `${folder.name}: ${parts.join(', ')}`,
        variant: errorCount > 0 && successCount === 0 && skippedCount === 0 ? "destructive" : "default",
      });

      queryClient.invalidateQueries({ queryKey: ['/api/pinecone/stats'] });

    } catch (error: any) {
      setArtifactStatuses(prev => ({
        ...prev,
        [folder.id]: { ...prev[folder.id], status: 'error', progress: 0 }
      }));
      toast({
        title: "Artifact processing failed",
        description: error.message || "Failed to process files",
        variant: "destructive",
      });
    }
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

  const handleUploadFolder = async (folder: TopicFolder, silent: boolean = false): Promise<{ successCount: number; errorCount: number; skippedCount: number }> => {
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
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
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
      const uploadableFiles = allFiles.filter(f => f.uploadable !== false);

      if (uploadableFiles.length === 0) {
        if (!silent) {
          toast({
            title: "No files to upload",
            description: `${folder.name} has no supported files (${allFiles.length} files skipped due to size or type)`,
            variant: "default",
          });
        }
        setUploadStatuses(prev => ({
          ...prev,
          [folder.id]: { ...prev[folder.id], status: 'success', progress: 100 }
        }));
        return { successCount: 0, errorCount: 0, skippedCount: 0 };
      }

      // Check for existing files (duplicates) in Pinecone
      setUploadStatuses(prev => ({
        ...prev,
        [folder.id]: { ...prev[folder.id], currentFile: 'Checking for duplicates...' }
      }));

      let existingFileIds: Set<string> = new Set();
      try {
        const checkResponse = await fetch('/api/pinecone/check-existing-files', {
          method: 'POST',
          credentials: 'include',
          headers,
          body: JSON.stringify({
            namespace: folder.namespace,
            fileIds: uploadableFiles.map(f => f.id)
          })
        });
        if (checkResponse.ok) {
          const checkData = await checkResponse.json();
          existingFileIds = new Set(checkData.existingFileIds || []);
        }
      } catch (checkError) {
        console.warn('Failed to check for duplicates, proceeding with upload:', checkError);
      }

      // Filter out files that already exist
      const files = uploadableFiles.filter(f => !existingFileIds.has(f.id));
      const skippedCount = existingFileIds.size;

      if (files.length === 0) {
        if (!silent) {
          toast({
            title: "All files already uploaded",
            description: `${folder.name}: ${skippedCount} files already exist in Pinecone`,
            variant: "default",
          });
        }
        setUploadStatuses(prev => ({
          ...prev,
          [folder.id]: { ...prev[folder.id], status: 'success', progress: 100, currentFile: '' }
        }));
        return { successCount: 0, errorCount: 0, skippedCount };
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

      if (!silent) {
        const skippedMsg = skippedCount > 0 ? `, ${skippedCount} duplicates skipped` : '';
        toast({
          title: "Upload complete",
          description: `${folder.name}: ${successCount} uploaded, ${errorCount} failed${skippedMsg}`,
          variant: errorCount > 0 ? "destructive" : "default",
        });
      }

      queryClient.invalidateQueries({ queryKey: ['/api/pinecone/stats'] });
      
      return { successCount, errorCount, skippedCount };

    } catch (error: any) {
      setUploadStatuses(prev => ({
        ...prev,
        [folder.id]: {
          ...prev[folder.id],
          status: 'error',
          progress: 0,
        }
      }));

      if (!silent) {
        toast({
          title: "Upload failed",
          description: error.message || "Failed to upload folder",
          variant: "destructive",
        });
      }
      
      return { successCount: 0, errorCount: 0, skippedCount: 0 };
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

  // Bulk upload all folders automatically
  const handleBulkUploadAll = async () => {
    if (!topicFolders || topicFolders.length === 0) {
      toast({
        title: "No folders available",
        description: "No topic folders found to upload",
        variant: "default",
      });
      return;
    }

    const foldersWithFiles = topicFolders.filter(f => f.supportedFiles > 0);
    if (foldersWithFiles.length === 0) {
      toast({
        title: "No files to upload",
        description: "All topic folders are empty",
        variant: "default",
      });
      return;
    }

    setIsBulkUploading(true);
    setBulkProgress({ current: 0, total: foldersWithFiles.length, currentFolder: '' });

    let totalSuccess = 0;
    let totalError = 0;
    let totalSkipped = 0;

    try {
      for (let i = 0; i < foldersWithFiles.length; i++) {
        const folder = foldersWithFiles[i];
        setBulkProgress({ current: i + 1, total: foldersWithFiles.length, currentFolder: folder.name });

        // Process this folder (silent mode - don't show individual toasts)
        const result = await handleUploadFolder(folder, true);
        
        // Use the returned counts directly
        totalSuccess += result.successCount;
        totalError += result.errorCount;
        totalSkipped += result.skippedCount;

        // Small delay between folders
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      const skippedMsg = totalSkipped > 0 ? `, ${totalSkipped} duplicates skipped` : '';
      toast({
        title: "Bulk upload complete",
        description: `Processed ${foldersWithFiles.length} folders: ${totalSuccess} uploaded, ${totalError} failed${skippedMsg}`,
        variant: totalError > 0 ? "destructive" : "default",
      });

    } catch (error: any) {
      toast({
        title: "Bulk upload failed",
        description: error.message || "Failed to complete bulk upload",
        variant: "destructive",
      });
    } finally {
      setIsBulkUploading(false);
      setBulkProgress({ current: 0, total: 0, currentFolder: '' });
      queryClient.invalidateQueries({ queryKey: ['/api/pinecone/stats'] });
    }
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
              <span className="block text-xs mt-1 text-white/50">Click on a folder to expand and select files. Supports PDF, Word, text, markdown, ZIP, and video/audio files (auto-transcribed via Whisper).</span>
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="default"
              size="sm"
              onClick={handleCheckAllStatuses}
              disabled={isCheckingAllStatuses || isBulkUploading || !topicFolders?.length}
              className="gap-1 bg-blue-600 hover:bg-blue-700"
              data-testid="button-check-all-statuses"
            >
              {isCheckingAllStatuses ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              {isCheckingAllStatuses ? 'Checking...' : 'Check Status'}
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleBulkUploadAll}
              disabled={isBulkUploading || !topicFolders?.some(f => f.supportedFiles > 0)}
              className="gap-1 bg-green-600 hover:bg-green-700"
              data-testid="button-upload-all-folders"
            >
              {isBulkUploading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              {isBulkUploading ? `Processing ${bulkProgress.current}/${bulkProgress.total}...` : 'Upload All'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                queryClient.invalidateQueries({ queryKey: ['/api/google-drive/topic-folders'] });
                refetch();
              }}
              className="gap-1"
              disabled={isBulkUploading}
              data-testid="button-refresh-folders"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </Button>
          </div>
        </div>
        <div className="flex gap-4 mt-2 flex-wrap">
          <Badge variant="outline" className="text-purple-400 border-purple-400/50">
            {topicFolders?.length || 0} folders
          </Badge>
          <Badge variant="outline" className="text-cyan-400 border-cyan-400/50">
            {totalFiles} files ready
          </Badge>
          {topicFolders && (() => {
            const personalCount = topicFolders.filter(f => isPersonalNamespace(f.namespace)).length;
            const nonPersonalCount = topicFolders.length - personalCount;
            return (
              <>
                <Badge variant="outline" className="gap-1 text-green-400 border-green-500/50">
                  <ShieldCheck className="w-3 h-3" />
                  {personalCount} personal
                </Badge>
                {nonPersonalCount > 0 && (
                  <Badge variant="outline" className="gap-1 text-amber-400 border-amber-500/50">
                    <AlertTriangle className="w-3 h-3" />
                    {nonPersonalCount} need artifacts
                  </Badge>
                )}
              </>
            );
          })()}
          {Object.keys(folderIngestionStatuses).length > 0 && (() => {
            const allStatuses = Object.values(folderIngestionStatuses).filter(s => !s.loading);
            if (allStatuses.length === 0) return null;
            const totalUploaded = allStatuses.reduce((sum, s) => sum + s.uploaded, 0);
            const totalKnown = allStatuses.reduce((sum, s) => sum + s.total, 0);
            const pct = totalKnown > 0 ? Math.round((totalUploaded / totalKnown) * 100) : 0;
            return (
              <Badge 
                variant="outline" 
                className={`gap-1 ${
                  totalUploaded === totalKnown && totalKnown > 0
                    ? 'text-green-400 border-green-500/50' 
                    : 'text-yellow-400 border-yellow-500/50'
                }`}
              >
                <CheckCircle2 className="w-3 h-3" />
                {totalUploaded}/{totalKnown} uploaded ({pct}%)
              </Badge>
            );
          })()}
        </div>
        {isBulkUploading && (
          <div className="mt-3 p-3 rounded-lg bg-green-500/10 border border-green-500/30">
            <div className="flex items-center gap-2 text-green-300 mb-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Processing folder {bulkProgress.current}/{bulkProgress.total}: {bulkProgress.currentFolder}</span>
            </div>
            <Progress value={(bulkProgress.current / bulkProgress.total) * 100} className="h-2" />
          </div>
        )}
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
                          {isPersonalNamespace(folder.namespace) ? (
                            <Badge variant="outline" className="text-xs gap-1 text-green-400 border-green-500/40 bg-green-500/10" title="Personal knowledge — verbatim chunks OK">
                              <ShieldCheck className="w-3 h-3" />
                              Personal
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs gap-1 text-amber-400 border-amber-500/40 bg-amber-500/10" title="Non-personal namespace — should use Learning Artifacts for new content">
                              <AlertTriangle className="w-3 h-3" />
                              Use Artifacts
                            </Badge>
                          )}
                          <span className={`text-sm ml-auto mr-4 ${hasFiles ? 'text-white/50' : 'text-white/30'}`}>
                            {folder.supportedFiles} files
                          </span>
                        </button>
                      </CollapsibleTrigger>
                      
                      <div className="flex items-center gap-2">
                        {(() => {
                          const ingestion = folderIngestionStatuses[folder.id];
                          if (ingestion && !ingestion.loading) {
                            const pct = ingestion.total > 0 ? Math.round((ingestion.uploaded / ingestion.total) * 100) : 0;
                            const isComplete = ingestion.uploaded === ingestion.total && ingestion.total > 0;
                            return (
                              <Badge 
                                variant="outline" 
                                className={`text-xs gap-1 ${
                                  isComplete 
                                    ? 'text-green-400 border-green-500/50 bg-green-500/10' 
                                    : ingestion.uploaded > 0 
                                      ? 'text-yellow-400 border-yellow-500/50 bg-yellow-500/10' 
                                      : 'text-white/40 border-white/20'
                                }`}
                                title={`${ingestion.uploaded} of ${ingestion.total} files uploaded to Pinecone (${pct}%)`}
                              >
                                {isComplete ? (
                                  <CheckCircle2 className="w-3 h-3" />
                                ) : (
                                  <Circle className="w-3 h-3" />
                                )}
                                {ingestion.uploaded}/{ingestion.total}
                              </Badge>
                            );
                          }
                          if (ingestion?.loading) {
                            return (
                              <Badge variant="outline" className="text-xs gap-1 text-white/40 border-white/20">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                Checking...
                              </Badge>
                            );
                          }
                          return null;
                        })()}
                        {getStatusBadge(status)}
                        {!isPersonalNamespace(folder.namespace) && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={artifactStatuses[folder.id]?.status === 'processing' || status?.status === 'uploading' || !hasFiles}
                            onClick={() => handleProcessAsArtifacts(folder)}
                            className="gap-1 border-amber-500/40 text-amber-400 hover:bg-amber-500/20 hover:text-amber-300"
                            data-testid={`button-artifacts-folder-${folder.id}`}
                            title="Process files through Learning Artifact pipeline for better retrieval"
                          >
                            {artifactStatuses[folder.id]?.status === 'processing' ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Sparkles className="w-3 h-3" />
                            )}
                            Artifacts
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={status?.status === 'uploading' || artifactStatuses[folder.id]?.status === 'processing' || !hasFiles}
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

                    {artifactStatuses[folder.id]?.status === 'processing' && (
                      <div className="mt-3 space-y-1">
                        <Progress value={artifactStatuses[folder.id].progress} className="h-2 [&>div]:bg-amber-500" />
                        <div className="flex justify-between text-xs text-amber-400/70">
                          <span>Creating artifacts: {artifactStatuses[folder.id].currentFile}</span>
                          <span>{artifactStatuses[folder.id].successCount}/{artifactStatuses[folder.id].totalFiles} files · {artifactStatuses[folder.id].totalArtifacts} artifacts</span>
                        </div>
                      </div>
                    )}

                    {artifactStatuses[folder.id]?.status === 'success' && (
                      <div className="mt-2 flex items-center gap-2 text-xs text-green-400">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{artifactStatuses[folder.id].successCount} files processed · {artifactStatuses[folder.id].totalArtifacts} artifacts created</span>
                      </div>
                    )}

                    {artifactStatuses[folder.id]?.status === 'error' && artifactStatuses[folder.id]?.successCount === 0 && (
                      <div className="mt-2 flex items-center gap-2 text-xs text-red-400">
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>Artifact processing failed</span>
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
                          onIngestionStatusUpdate={(status) => updateFolderIngestionStatus(folder.id, status)}
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
  onIngestionStatusUpdate?: (status: FolderIngestionStatus) => void;
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
  onIngestionStatusUpdate,
}: FolderFilesProps) {
  const { data: files, isLoading } = useQuery<FileInfo[]>({
    queryKey: ['/api/google-drive/topic-folder', folderId, 'files'],
    select: (data: any) => data.files || [],
  });

  const uploadableFiles = files?.filter(f => f.uploadable !== false) || [];
  const uploadableFileIds = uploadableFiles.map(f => f.id);

  const { data: existingFilesData, isLoading: checkingExisting } = useQuery<{ existingFileIds: string[] }>({
    queryKey: ['/api/pinecone/check-existing-files', folder.namespace, uploadableFileIds.join(',')],
    enabled: uploadableFileIds.length > 0,
    queryFn: async () => {
      const adminSecret = localStorage.getItem('admin_secret');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (adminSecret) headers['X-Admin-Secret'] = adminSecret;
      const res = await fetch('/api/pinecone/check-existing-files', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({ namespace: folder.namespace, fileIds: uploadableFileIds })
      });
      if (!res.ok) throw new Error('Failed to check existing files');
      return res.json();
    },
    staleTime: 30000,
  });

  const existingFileIds = new Set(existingFilesData?.existingFileIds || []);

  useEffect(() => {
    if (onIngestionStatusUpdate && uploadableFileIds.length > 0) {
      onIngestionStatusUpdate({
        uploaded: existingFileIds.size,
        total: uploadableFileIds.length,
        loading: isLoading || checkingExisting,
      });
    }
  }, [existingFileIds.size, uploadableFileIds.length, isLoading, checkingExisting]);

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

  const skippedFiles = files.filter(f => f.uploadable === false);
  const selectedCount = selectedFiles.size;
  const notUploadedFiles = uploadableFiles.filter(f => !existingFileIds.has(f.id));
  const allSelected = selectedCount === notUploadedFiles.length && notUploadedFiles.length > 0;
  const someSelected = selectedCount > 0 && selectedCount < notUploadedFiles.length;

  const handleSelectAll = () => {
    if (allSelected) {
      onDeselectAll();
    } else {
      onSelectAll(notUploadedFiles.map(f => f.id));
    }
  };

  const handleUploadSelected = () => {
    const filesToUpload = notUploadedFiles.filter(f => selectedFiles.has(f.id));
    onUploadSelected(filesToUpload);
  };

  const alreadyUploadedFiles = uploadableFiles.filter(f => existingFileIds.has(f.id));

  return (
    <div className="space-y-3 pl-6">
      {checkingExisting && (
        <div className="flex items-center gap-2 text-xs text-white/50 py-1">
          <Loader2 className="w-3 h-3 animate-spin" />
          Checking which files are already in Pinecone...
        </div>
      )}

      {!checkingExisting && uploadableFiles.length > 0 && (
        <div className="flex items-center gap-4 text-xs py-1 border-b border-white/10 pb-2">
          <span className="flex items-center gap-1 text-green-400">
            <CheckCircle2 className="w-3 h-3" />
            {alreadyUploadedFiles.length} uploaded
          </span>
          <span className="flex items-center gap-1 text-yellow-400">
            <Circle className="w-3 h-3" />
            {notUploadedFiles.length} not uploaded
          </span>
          {skippedFiles.length > 0 && (
            <span className="flex items-center gap-1 text-orange-400/70">
              <CloudOff className="w-3 h-3" />
              {skippedFiles.length} skipped
            </span>
          )}
        </div>
      )}

      {/* Selection controls for not-yet-uploaded files */}
      {notUploadedFiles.length > 0 && (
        <div className="flex items-center justify-between pb-2">
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
              {allSelected ? 'Deselect All' : 'Select All Not Uploaded'}
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

      {/* Already uploaded files section */}
      {alreadyUploadedFiles.length > 0 && (
        <div>
          <div className="text-xs text-green-400/70 mb-2 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            Already in Pinecone ({alreadyUploadedFiles.length})
          </div>
          <div className="grid grid-cols-1 gap-1">
            {alreadyUploadedFiles.map(file => (
              <div 
                key={file.id} 
                className="flex items-center gap-2 text-sm py-1.5 px-2 rounded text-white/50"
                data-testid={`file-item-uploaded-${file.id}`}
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                <FileText className="w-3 h-3 text-green-400/50 flex-shrink-0" />
                <span className="truncate flex-1">{file.name}</span>
                <Badge variant="outline" className="text-[10px] text-green-400/60 border-green-500/30 px-1.5 py-0">
                  uploaded
                </Badge>
                <span className="text-xs text-white/30 flex-shrink-0">
                  {file.fileSizeFormatted || formatFileSize(file.size)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Not yet uploaded files section */}
      {notUploadedFiles.length > 0 && (
        <div>
          <div className="text-xs text-yellow-400/70 mb-2 flex items-center gap-1">
            <Circle className="w-3 h-3" />
            Not yet uploaded ({notUploadedFiles.length})
          </div>
          <div className="grid grid-cols-1 gap-1">
            {notUploadedFiles.map(file => (
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
