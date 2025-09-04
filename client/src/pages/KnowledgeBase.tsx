import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DocumentUpload } from "@/components/DocumentUpload";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { Search, FileText, Globe, Type, Filter, MoreHorizontal, Download, Trash2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type Document = {
  id: string;
  user_id: string;
  filename: string;
  file_type: string;
  file_size: string;
  status: string;
  chunks_count: string;
  created_at: string;
  updated_at: string;
};

type User = {
  id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  profileImageUrl?: string;
};

export default function KnowledgeBase() {
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedType, setSelectedType] = useState("all");

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
      return;
    }
  }, [isAuthenticated, authLoading, toast]);

  // Fetch documents
  const { data: documents = [], isLoading: documentsLoading } = useQuery<Document[]>({
    queryKey: ["/api/documents"],
    enabled: isAuthenticated,
    retry: false,
  });

  // Fetch users for attribution
  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
    enabled: isAuthenticated,
    retry: false,
  });

  // Delete document mutation
  const deleteDocument = useMutation({
    mutationFn: async (documentId: string) => {
      const response = await fetch(`/api/documents/${documentId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error(`${response.status}: ${response.statusText}`);
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      toast({
        title: "Document deleted",
        description: "Document has been successfully deleted.",
      });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      console.error('Delete error:', error);
      toast({
        title: "Error",
        description: "Failed to delete document. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Filter documents based on search term and type
  const filteredDocuments = documents.filter(doc => {
    const matchesSearch = doc.filename.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = selectedType === "all" || 
      (selectedType === "pdf" && doc.file_type === "application/pdf") ||
      (selectedType === "doc" && doc.file_type.includes("word")) ||
      (selectedType === "txt" && doc.file_type === "text/plain");
    return matchesSearch && matchesType;
  });

  // Calculate total storage used
  const totalStorage = documents.reduce((total, doc) => {
    return total + (parseInt(doc.file_size) || 0);
  }, 0);

  // Format file size
  const formatFileSize = (bytes: string | number) => {
    const size = typeof bytes === 'string' ? parseInt(bytes) : bytes;
    if (size === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(size) / Math.log(k));
    return parseFloat((size / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Get user info for document
  const getUserInfo = (userId: string) => {
    const docUser = users.find(u => u.id === userId);
    return docUser || { email: 'Unknown User', firstName: '', lastName: '', profileImageUrl: null };
  };

  // Get file icon based on type
  const getFileIcon = (fileType: string) => {
    if (fileType.includes('pdf')) return '📄';
    if (fileType.includes('word')) return '📝';
    if (fileType.includes('text')) return '📄';
    return '📄';
  };

  if (authLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <h1 className="text-2xl font-semibold text-foreground">Knowledge Base</h1>
              <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                <div className="flex items-center space-x-1">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span>RAG Storage: {formatFileSize(totalStorage)} / 21.0 MB</span>
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Avatar className="h-8 w-8">
                {user?.profileImageUrl ? (
                  <AvatarImage src={user.profileImageUrl} alt={user.email || "User"} />
                ) : null}
                <AvatarFallback>
                  {user?.firstName?.[0] || user?.email?.[0]?.toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm text-muted-foreground">{user?.email}</span>
              <Button variant="outline" size="sm" onClick={() => window.location.href = "/api/logout"}>
                Logout
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-6">
        {/* Action Buttons */}
        <div className="flex items-center space-x-4 mb-6">
          <Button variant="outline" size="sm" className="flex items-center space-x-2">
            <Globe className="w-4 h-4" />
            <span>Add URL</span>
          </Button>
          
          <DocumentUpload />
          
          <Button variant="outline" size="sm" className="flex items-center space-x-2">
            <Type className="w-4 h-4" />
            <span>Create Text</span>
          </Button>
        </div>

        {/* Search and Filter */}
        <div className="flex items-center space-x-4 mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search Knowledge Base..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
              data-testid="input-search-documents"
            />
          </div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="flex items-center space-x-2">
                <Filter className="w-4 h-4" />
                <span>Type</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => setSelectedType("all")}>
                All Types
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSelectedType("pdf")}>
                PDF Documents
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSelectedType("doc")}>
                Word Documents
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSelectedType("txt")}>
                Text Files
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Documents Table */}
        <Card>
          <CardContent className="p-0">
            {documentsLoading ? (
              <div className="flex items-center justify-center p-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                <span className="ml-2 text-muted-foreground">Loading documents...</span>
              </div>
            ) : filteredDocuments.length === 0 ? (
              <div className="text-center p-8">
                <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-lg font-medium text-muted-foreground mb-2">
                  {searchTerm ? "No documents match your search" : "No documents uploaded yet"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {searchTerm ? "Try adjusting your search terms" : "Upload your first document to get started"}
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Created by</TableHead>
                    <TableHead>Last updated</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDocuments.map((doc) => {
                    const userInfo = getUserInfo(doc.user_id);
                    return (
                      <TableRow key={doc.id} data-testid={`row-document-${doc.id}`}>
                        <TableCell>
                          <div className="flex items-center space-x-3">
                            <span className="text-lg">{getFileIcon(doc.file_type)}</span>
                            <div>
                              <div className="font-medium text-foreground">
                                {doc.filename}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {formatFileSize(doc.file_size)}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            <Avatar className="h-6 w-6">
                              {userInfo.profileImageUrl ? (
                                <AvatarImage src={userInfo.profileImageUrl} alt={userInfo.email} />
                              ) : null}
                              <AvatarFallback className="text-xs">
                                {userInfo.firstName?.[0] || userInfo.email?.[0]?.toUpperCase() || 'U'}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-sm text-muted-foreground">
                              {userInfo.email}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm text-muted-foreground">
                            {new Date(doc.updated_at).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                              hour: 'numeric',
                              minute: 'numeric',
                              hour12: true
                            })}
                          </div>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem className="flex items-center space-x-2">
                                <Download className="h-4 w-4" />
                                <span>Download</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                className="flex items-center space-x-2 text-red-600 focus:text-red-600"
                                onClick={() => deleteDocument.mutate(doc.id)}
                                data-testid={`button-delete-${doc.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                                <span>Delete</span>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}