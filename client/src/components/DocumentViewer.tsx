import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Video, Clock, FileCheck, AlertCircle, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface Document {
  id: string;
  userId: string;
  filename: string;
  fileType: string;
  fileSize: number;
  status: 'processing' | 'completed' | 'failed';
  chunksCount?: number;
  textLength?: number;
  pineconeNamespace?: string;
  createdAt: string;
  updatedAt: string;
}

export function DocumentViewer() {
  const { user } = useAuth();
  
  const { data: documents = [], isLoading } = useQuery<Document[]>({
    queryKey: ['/api/documents/user', user?.id],
    queryFn: async () => {
      if (!user?.id) throw new Error('User ID required');
      const response = await fetch(`/api/documents/user/${user.id}`, {
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch documents: ${response.statusText}`);
      }
      const data = await response.json();
      // Extract documents array from response
      return data.documents || [];
    },
    enabled: !!user?.id,
    refetchInterval: (query) => {
      const data = query.state.data;
      // Auto-refresh if any documents are still processing
      const hasProcessing = data?.some((doc: Document) => doc.status === 'processing');
      return hasProcessing ? 3000 : false;
    },
  });

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <Badge variant="default" className="bg-green-500 hover:bg-green-600">
            <FileCheck className="w-3 h-3 mr-1" />
            Completed
          </Badge>
        );
      case 'processing':
        return (
          <Badge variant="default" className="bg-blue-500 hover:bg-blue-600">
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            Processing
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="destructive">
            <AlertCircle className="w-3 h-3 mr-1" />
            Failed
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getFileIcon = (fileType: string) => {
    if (fileType === 'application/pdf') {
      return <FileText className="w-5 h-5 text-red-500" />;
    }
    if (fileType.startsWith('video/') || fileType.startsWith('audio/')) {
      return <Video className="w-5 h-5 text-purple-500" />;
    }
    return <FileText className="w-5 h-5 text-blue-500" />;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Your Documents
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 p-3 border rounded-lg">
              <Skeleton className="w-10 h-10 rounded" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (documents.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Your Documents
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              No documents uploaded yet. Upload your first document above!
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="w-5 h-5" />
          Your Documents ({documents.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {documents.map((doc) => (
          <div
            key={doc.id}
            className="flex items-start gap-3 p-3 border rounded-lg hover:bg-accent/50 transition-colors"
            data-testid={`document-item-${doc.id}`}
          >
            <div className="mt-1">{getFileIcon(doc.fileType)}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2 mb-1">
                <p className="font-medium text-sm truncate" title={doc.filename}>
                  {doc.filename}
                </p>
                {getStatusBadge(doc.status)}
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                <span>{formatFileSize(doc.fileSize)}</span>
                {doc.chunksCount !== undefined && doc.status === 'completed' && (
                  <span>{doc.chunksCount} chunks</span>
                )}
                {doc.textLength !== undefined && doc.status === 'completed' && (
                  <span>{doc.textLength.toLocaleString()} chars</span>
                )}
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatDate(doc.createdAt)}
                </span>
              </div>
              {doc.pineconeNamespace && doc.status === 'completed' && (
                <p className="text-xs text-muted-foreground mt-1">
                  Stored in: {doc.pineconeNamespace}
                </p>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
