import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, Folder, FileText, File, ArrowLeft, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { type PineconeCategory } from "@shared/pineconeCategories";

interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
  iconLink?: string;
  webViewLink?: string;
}

interface GoogleDrivePickerProps {
  selectedCategory: PineconeCategory;
  onUploadComplete?: () => void;
}

export function GoogleDrivePicker({ selectedCategory, onUploadComplete }: GoogleDrivePickerProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [folders, setFolders] = useState<GoogleDriveFile[]>([]);
  const [currentFolder, setCurrentFolder] = useState<GoogleDriveFile | null>(null);
  const [files, setFiles] = useState<GoogleDriveFile[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Map<string, string>>(new Map());
  const { toast } = useToast();

  useEffect(() => {
    checkConnection();
  }, []);

  const checkConnection = async () => {
    try {
      const response = await fetch("/api/google-drive/status");
      const data = await response.json();
      setIsConnected(data.connected);
      
      if (data.connected) {
        loadSharedFolders();
      }
    } catch (error) {
      console.error("Error checking Google Drive connection:", error);
      setIsConnected(false);
    } finally {
      setIsLoading(false);
    }
  };

  const loadSharedFolders = async () => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/google-drive/folders");
      const data = await response.json();
      setFolders(data.folders || []);
    } catch (error) {
      console.error("Error loading folders:", error);
      toast({
        title: "Error",
        description: "Failed to load Google Drive folders",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadFolderContents = async (folderId: string) => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/google-drive/folder/${folderId}`);
      const data = await response.json();
      setFiles(data.files || []);
    } catch (error) {
      console.error("Error loading folder contents:", error);
      toast({
        title: "Error",
        description: "Failed to load folder contents",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const openFolder = (folder: GoogleDriveFile) => {
    setCurrentFolder(folder);
    setSelectedFiles(new Set());
    loadFolderContents(folder.id);
  };

  const goBack = () => {
    setCurrentFolder(null);
    setFiles([]);
    setSelectedFiles(new Set());
  };

  const toggleFileSelection = (fileId: string) => {
    const newSelected = new Set(selectedFiles);
    if (newSelected.has(fileId)) {
      newSelected.delete(fileId);
    } else {
      newSelected.add(fileId);
    }
    setSelectedFiles(newSelected);
  };

  const uploadSelectedFiles = async () => {
    if (selectedFiles.size === 0) return;

    setIsUploading(true);
    const progressMap = new Map<string, string>();

    try {
      const filesToUpload = files.filter(f => selectedFiles.has(f.id));
      let successCount = 0;
      let errorCount = 0;

      for (const file of filesToUpload) {
        try {
          progressMap.set(file.id, "Uploading...");
          setUploadProgress(new Map(progressMap));

          const response = await fetch("/api/google-drive/upload-to-pinecone", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              fileId: file.id,
              fileName: file.name,
              indexName: "ai-chatbot",
              namespace: selectedCategory,
            }),
          });

          if (!response.ok) {
            throw new Error("Upload failed");
          }

          progressMap.set(file.id, "✓ Complete");
          setUploadProgress(new Map(progressMap));
          successCount++;
        } catch (error) {
          console.error(`Error uploading ${file.name}:`, error);
          progressMap.set(file.id, "✗ Failed");
          setUploadProgress(new Map(progressMap));
          errorCount++;
        }
      }

      if (successCount > 0) {
        toast({
          title: "Upload Complete",
          description: `Successfully uploaded ${successCount} file(s) to ${selectedCategory}`,
        });
        setSelectedFiles(new Set());
        onUploadComplete?.();
      }

      if (errorCount > 0) {
        toast({
          title: "Some uploads failed",
          description: `${errorCount} file(s) failed to upload`,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error uploading files:", error);
      toast({
        title: "Upload Failed",
        description: "Failed to upload files from Google Drive",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      setTimeout(() => setUploadProgress(new Map()), 3000);
    }
  };

  if (isLoading && !isConnected) {
    return (
      <Card className="glass-strong border-white/10">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
          <span className="ml-2 text-white/70">Checking Google Drive connection...</span>
        </CardContent>
      </Card>
    );
  }

  if (!isConnected) {
    return (
      <Card className="glass-strong border-white/10">
        <CardHeader>
          <CardTitle className="text-white">Google Drive Not Connected</CardTitle>
          <CardDescription className="text-white/70">
            Google Drive integration is not set up. Please contact support to enable this feature.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="glass-strong border-white/10">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-white flex items-center gap-2">
              <Folder className="w-5 h-5 text-purple-400" />
              {currentFolder ? currentFolder.name : "Google Drive Shared Folders"}
            </CardTitle>
            <CardDescription className="text-white/70">
              {currentFolder 
                ? `Select files to upload to ${selectedCategory}` 
                : "Browse your shared Google Drive folders"}
            </CardDescription>
          </div>
          {currentFolder && (
            <Button
              variant="ghost"
              size="sm"
              onClick={goBack}
              className="text-white/70 hover:text-white"
              data-testid="button-back-to-folders"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] rounded-lg border border-white/10 bg-black/20 p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
            </div>
          ) : currentFolder ? (
            <div className="space-y-2">
              {files.length === 0 ? (
                <p className="text-center text-white/50 py-8">No files in this folder</p>
              ) : (
                files.map((file) => {
                  const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
                  const isSelected = selectedFiles.has(file.id);
                  const progress = uploadProgress.get(file.id);

                  return (
                    <div
                      key={file.id}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-lg transition-all cursor-pointer",
                        isSelected 
                          ? "bg-purple-500/20 border border-purple-500/50" 
                          : "hover:bg-white/5 border border-transparent"
                      )}
                      onClick={() => !isFolder && !isUploading && toggleFileSelection(file.id)}
                      data-testid={`file-item-${file.id}`}
                    >
                      {isFolder ? (
                        <Folder className="w-5 h-5 text-blue-400 flex-shrink-0" />
                      ) : (
                        <FileText className="w-5 h-5 text-purple-400 flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm truncate">{file.name}</p>
                        {file.size && (
                          <p className="text-white/50 text-xs">
                            {(parseInt(file.size) / 1024 / 1024).toFixed(2)} MB
                          </p>
                        )}
                      </div>
                      {progress && (
                        <span className="text-xs text-white/70 flex-shrink-0">{progress}</span>
                      )}
                      {!isFolder && isSelected && !progress && (
                        <CheckCircle2 className="w-5 h-5 text-purple-400 flex-shrink-0" />
                      )}
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {folders.length === 0 ? (
                <p className="text-center text-white/50 py-8">No shared folders found</p>
              ) : (
                folders.map((folder) => (
                  <div
                    key={folder.id}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-white/5 cursor-pointer transition-all border border-transparent hover:border-purple-500/30"
                    onClick={() => openFolder(folder)}
                    data-testid={`folder-item-${folder.id}`}
                  >
                    <Folder className="w-5 h-5 text-blue-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm truncate">{folder.name}</p>
                      {folder.modifiedTime && (
                        <p className="text-white/50 text-xs">
                          Modified {new Date(folder.modifiedTime).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </ScrollArea>

        {currentFolder && selectedFiles.size > 0 && (
          <div className="mt-4 flex items-center justify-between p-4 rounded-lg bg-purple-500/10 border border-purple-500/30">
            <span className="text-white text-sm">
              {selectedFiles.size} file(s) selected
            </span>
            <Button
              onClick={uploadSelectedFiles}
              disabled={isUploading}
              className="bg-gradient-primary hover:opacity-90 text-white"
              data-testid="button-upload-selected"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  Upload to {selectedCategory}
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
