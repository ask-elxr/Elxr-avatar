import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, Folder, FileText, File, ArrowLeft, CheckCircle2, Search, X, HardDrive } from "lucide-react";
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

interface SharedDrive {
  id: string;
  name: string;
  createdTime?: string;
}

interface GoogleDrivePickerProps {
  selectedCategory: PineconeCategory;
  onUploadComplete?: () => void;
}

export function GoogleDrivePicker({ selectedCategory, onUploadComplete }: GoogleDrivePickerProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [folders, setFolders] = useState<GoogleDriveFile[]>([]);
  const [sharedDrives, setSharedDrives] = useState<SharedDrive[]>([]);
  const [currentDrive, setCurrentDrive] = useState<SharedDrive | null>(null);
  const [currentFolder, setCurrentFolder] = useState<GoogleDriveFile | null>(null);
  const [files, setFiles] = useState<GoogleDriveFile[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Map<string, string>>(new Map());
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<GoogleDriveFile[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
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
        loadAllDriveData();
      }
    } catch (error) {
      console.error("Error checking Google Drive connection:", error);
      setIsConnected(false);
    } finally {
      setIsLoading(false);
    }
  };

  const loadAllDriveData = async () => {
    try {
      setIsLoading(true);
      // Load both shared folders and shared drives in parallel
      const [foldersRes, drivesRes] = await Promise.all([
        fetch("/api/google-drive/folders"),
        fetch("/api/google-drive/shared-drives")
      ]);
      const foldersData = await foldersRes.json();
      const drivesData = await drivesRes.json();
      setFolders(foldersData.folders || []);
      setSharedDrives(drivesData.drives || []);
    } catch (error) {
      console.error("Error loading drive data:", error);
      toast({
        title: "Error",
        description: "Failed to load Google Drive data",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadSharedDriveFolders = async (driveId: string) => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/google-drive/shared-drive/${driveId}/folders`);
      const data = await response.json();
      setFolders(data.folders || []);
    } catch (error) {
      console.error("Error loading shared drive folders:", error);
      toast({
        title: "Error",
        description: "Failed to load shared drive folders",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadFolderContents = async (folderId: string) => {
    try {
      setIsLoading(true);
      // Include driveId if we're inside a Shared Drive for proper API context
      const url = currentDrive 
        ? `/api/google-drive/folder/${folderId}?driveId=${currentDrive.id}`
        : `/api/google-drive/folder/${folderId}`;
      const response = await fetch(url);
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

  const openSharedDrive = (drive: SharedDrive) => {
    setCurrentDrive(drive);
    setSelectedFiles(new Set());
    loadSharedDriveFolders(drive.id);
  };

  const openFolder = (folder: GoogleDriveFile) => {
    setCurrentFolder(folder);
    setSelectedFiles(new Set());
    loadFolderContents(folder.id);
  };

  const goBack = () => {
    if (showSearchResults) {
      setShowSearchResults(false);
      setSearchResults([]);
      setSearchQuery("");
      setSelectedFiles(new Set());
    } else if (currentFolder) {
      // If in a folder, go back to the drive/folder list
      setCurrentFolder(null);
      setFiles([]);
      setSelectedFiles(new Set());
      if (currentDrive) {
        // Reload shared drive folders
        loadSharedDriveFolders(currentDrive.id);
      }
    } else if (currentDrive) {
      // If in a shared drive, go back to main view
      setCurrentDrive(null);
      setSelectedFiles(new Set());
      loadAllDriveData();
    } else {
      setCurrentFolder(null);
      setFiles([]);
      setSelectedFiles(new Set());
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    
    try {
      setIsSearching(true);
      const response = await fetch(`/api/google-drive/search?q=${encodeURIComponent(searchQuery.trim())}`);
      const data = await response.json();
      setSearchResults(data.files || []);
      setShowSearchResults(true);
    } catch (error) {
      console.error("Error searching Google Drive:", error);
      toast({
        title: "Search Failed",
        description: "Failed to search Google Drive",
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  };

  const clearSearch = () => {
    setSearchQuery("");
    setSearchResults([]);
    setShowSearchResults(false);
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
      const sourceFiles = showSearchResults ? searchResults : files;
      const filesToUpload = sourceFiles.filter(f => selectedFiles.has(f.id));
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

  const getTitle = () => {
    if (showSearchResults) return `Search Results for "${searchQuery}"`;
    if (currentFolder) return currentFolder.name;
    if (currentDrive) return currentDrive.name;
    return "Google Drive";
  };

  const getDescription = () => {
    if (showSearchResults) return `${searchResults.length} file(s) found - Select files to upload to ${selectedCategory}`;
    if (currentFolder) return `Select files to upload to ${selectedCategory}`;
    if (currentDrive) return "Select a folder to browse";
    return "Browse Shared Drives and shared folders";
  };

  return (
    <Card className="glass-strong border-white/10">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-white flex items-center gap-2">
              {currentDrive ? (
                <HardDrive className="w-5 h-5 text-blue-400" />
              ) : (
                <Folder className="w-5 h-5 text-purple-400" />
              )}
              {getTitle()}
            </CardTitle>
            <CardDescription className="text-white/70">
              {getDescription()}
            </CardDescription>
          </div>
          {(currentFolder || currentDrive || showSearchResults) && (
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
        
        {!currentFolder && !currentDrive && !showSearchResults && (
          <div className="flex gap-2 mt-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-white/50" />
              <Input
                type="text"
                placeholder="Search all files and folders..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="pl-10 pr-10 bg-black/30 border-white/20 text-white placeholder:text-white/50"
                data-testid="input-search-drive"
              />
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearSearch}
                  className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7 p-0 text-white/50 hover:text-white"
                  data-testid="button-clear-search"
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
            <Button
              onClick={handleSearch}
              disabled={!searchQuery.trim() || isSearching}
              className="bg-gradient-primary hover:opacity-90 text-white"
              data-testid="button-search-drive"
            >
              {isSearching ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] rounded-lg border border-white/10 bg-black/20 p-4">
          {isLoading || isSearching ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
              <span className="ml-2 text-white/70">
                {isSearching ? "Searching..." : "Loading..."}
              </span>
            </div>
          ) : showSearchResults ? (
            <div className="space-y-2">
              {searchResults.length === 0 ? (
                <p className="text-center text-white/50 py-8">No files found matching "{searchQuery}"</p>
              ) : (
                searchResults.map((file) => {
                  const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
                  const isSelected = selectedFiles.has(file.id);
                  const progress = uploadProgress.get(file.id);

                  return (
                    <div
                      key={file.id}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-lg transition-all cursor-pointer",
                        isFolder 
                          ? "opacity-50 cursor-not-allowed"
                          : isSelected 
                            ? "bg-purple-500/20 border border-purple-500/50" 
                            : "hover:bg-white/5 border border-transparent"
                      )}
                      onClick={() => !isFolder && !isUploading && toggleFileSelection(file.id)}
                      data-testid={`search-item-${file.id}`}
                    >
                      {isFolder ? (
                        <Folder className="w-5 h-5 text-blue-400 flex-shrink-0" />
                      ) : (
                        <FileText className="w-5 h-5 text-purple-400 flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm truncate">{file.name}</p>
                        {file.modifiedTime && (
                          <p className="text-white/50 text-xs">
                            Modified {new Date(file.modifiedTime).toLocaleDateString()}
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
          ) : currentDrive ? (
            <div className="space-y-2">
              {folders.length === 0 ? (
                <p className="text-center text-white/50 py-8">No folders found in this drive</p>
              ) : (
                folders.map((folder) => (
                  <div
                    key={folder.id}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-white/5 cursor-pointer transition-all border border-transparent hover:border-purple-500/30"
                    onClick={() => openFolder(folder)}
                    data-testid={`drive-folder-item-${folder.id}`}
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
          ) : (
            <div className="space-y-4">
              {/* Shared Drives Section */}
              {sharedDrives.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-white/70 px-1">Shared Drives</h3>
                  {sharedDrives.map((drive) => (
                    <div
                      key={drive.id}
                      className="flex items-center gap-3 p-3 rounded-lg hover:bg-white/5 cursor-pointer transition-all border border-transparent hover:border-blue-500/30"
                      onClick={() => openSharedDrive(drive)}
                      data-testid={`shared-drive-${drive.id}`}
                    >
                      <HardDrive className="w-5 h-5 text-blue-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm truncate">{drive.name}</p>
                        <p className="text-white/50 text-xs">Shared Drive</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              {/* Shared With Me Section */}
              <div className="space-y-2">
                {sharedDrives.length > 0 && folders.length > 0 && (
                  <h3 className="text-sm font-medium text-white/70 px-1">Shared With Me</h3>
                )}
                {folders.length === 0 && sharedDrives.length === 0 ? (
                  <p className="text-center text-white/50 py-8">No shared folders or drives found</p>
                ) : (
                  folders.map((folder) => (
                    <div
                      key={folder.id}
                      className="flex items-center gap-3 p-3 rounded-lg hover:bg-white/5 cursor-pointer transition-all border border-transparent hover:border-purple-500/30"
                      onClick={() => openFolder(folder)}
                      data-testid={`folder-item-${folder.id}`}
                    >
                      <Folder className="w-5 h-5 text-purple-400 flex-shrink-0" />
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
            </div>
          )}
        </ScrollArea>

        {(currentFolder || showSearchResults) && selectedFiles.size > 0 && (
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
