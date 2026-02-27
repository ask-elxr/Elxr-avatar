import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Database, HardDrive, FileText, Layers, Activity, CheckCircle, AlertCircle, ChevronDown } from "lucide-react";
import { Progress } from "@/components/ui/progress";

export function DatabaseStatus() {
  const [isNamespaceOpen, setIsNamespaceOpen] = useState(false);
  
  const { data: stats, isLoading } = useQuery({
    queryKey: ['/api/pinecone/stats'],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  if (isLoading || !stats) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            Database Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const statsData = stats as any;
  const pineconeData = statsData.pinecone || {};
  const documentsData = statsData.documents || {};

  // Calculate total vectors across all namespaces
  const totalVectors = pineconeData.namespaces 
    ? Object.values(pineconeData.namespaces).reduce((sum: number, ns: any) => sum + (ns.recordCount || ns.vectorCount || 0), 0)
    : 0;

  const namespaceCount = pineconeData.namespaces ? Object.keys(pineconeData.namespaces).length : 0;

  // Document statistics
  const totalDocs = documentsData.total || 0;
  const totalChunks = documentsData.totalChunks || 0;
  const byStatus = documentsData.byStatus || [];
  const byType = documentsData.byType || [];

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'processed':
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'processing':
        return <Activity className="w-4 h-4 text-blue-500 animate-pulse" />;
      case 'failed':
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return <FileText className="w-4 h-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="space-y-4">
      {/* Overview Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Layers className="w-4 h-4 text-muted-foreground" />
              Total Vectors
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{totalVectors.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">In Pinecone index</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-muted-foreground" />
              Namespaces
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{namespaceCount}</p>
            <p className="text-xs text-muted-foreground mt-1">Knowledge categories</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileText className="w-4 h-4 text-muted-foreground" />
              Documents
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{totalDocs}</p>
            <p className="text-xs text-muted-foreground mt-1">Total uploaded</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Database className="w-4 h-4 text-muted-foreground" />
              Chunks
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{totalChunks.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">Text segments</p>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Statistics */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Namespace Breakdown - Collapsible */}
        <Card>
          <Collapsible open={isNamespaceOpen} onOpenChange={setIsNamespaceOpen}>
            <CollapsibleTrigger asChild>
              <CardHeader className="pb-3 cursor-pointer hover:bg-muted/50 transition-colors rounded-t-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-semibold">Namespace Distribution</CardTitle>
                    <CardDescription className="text-xs">Vector counts by knowledge category ({namespaceCount} namespaces)</CardDescription>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${isNamespaceOpen ? 'rotate-180' : ''}`} />
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 duration-200">
              <CardContent className="pt-0">
                <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                  {pineconeData.namespaces && Object.entries(pineconeData.namespaces)
                    .sort(([, a]: [string, any], [, b]: [string, any]) => (b.recordCount || b.vectorCount || 0) - (a.recordCount || a.vectorCount || 0))
                    .map(([namespace, data]: [string, any]) => {
                    const vectorCount = data.recordCount || data.vectorCount || 0;
                    const percentage = totalVectors > 0 ? (vectorCount / totalVectors) * 100 : 0;
                    
                    return (
                      <div key={namespace} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium truncate text-xs">{namespace}</span>
                          <span className="text-muted-foreground ml-2 text-xs">{vectorCount.toLocaleString()}</span>
                        </div>
                        <Progress value={percentage} className="h-1.5" />
                      </div>
                    );
                  })}
                  {(!pineconeData.namespaces || Object.keys(pineconeData.namespaces).length === 0) && (
                    <p className="text-sm text-muted-foreground text-center py-4">No namespaces found</p>
                  )}
                </div>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        {/* Document Status */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Document Processing Status</CardTitle>
            <CardDescription className="text-xs">Current state of uploaded documents</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {byStatus.length > 0 ? (
                byStatus.map((item: any) => (
                  <div key={item.status} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(item.status)}
                      <span className="text-sm font-medium capitalize">{item.status}</span>
                    </div>
                    <span className="text-sm font-semibold">{item.count}</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">No documents yet</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Document Types */}
      {byType.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Document Types</CardTitle>
            <CardDescription className="text-xs">Distribution by file format</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {byType.map((item: any) => (
                <div key={item.type} className="flex flex-col items-center justify-center p-4 bg-muted/30 rounded-lg">
                  <p className="text-2xl font-bold">{item.count}</p>
                  <p className="text-xs text-muted-foreground uppercase mt-1">{item.type}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Index Information */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Pinecone Index Details</CardTitle>
          <CardDescription className="text-xs">Technical specifications</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Index Name</p>
              <p className="text-sm font-medium mt-1">{statsData.indexName || 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Dimension</p>
              <p className="text-sm font-medium mt-1">{pineconeData.dimension || 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Vectors</p>
              <p className="text-sm font-medium mt-1">{totalVectors.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Status</p>
              <div className="flex items-center gap-2 mt-1">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                <p className="text-sm font-medium text-green-600 dark:text-green-400">Connected</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
