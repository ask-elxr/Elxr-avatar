import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Database,
  RefreshCw,
  User,
  ExternalLink,
  Loader2,
} from "lucide-react";

interface NamespaceStatus {
  namespace: string;
  exists: boolean;
  vectorCount: number;
}

interface AvatarStatus {
  avatarId: string;
  avatarName: string;
  isActive: boolean;
  status: 'ok' | 'warning' | 'error';
  issues: string[];
  configuredNamespaces: string[];
  namespaceStatus: NamespaceStatus[];
  usesExternalSources: boolean;
  externalSources: string[];
  pineconeOnly: boolean;
}

interface Summary {
  totalAvatars: number;
  activeAvatars: number;
  pineconeOnlyCount: number;
  withExternalSources: number;
  withIssues: number;
}

interface PineconeStatusResponse {
  summary: Summary;
  avatars: AvatarStatus[];
  pineconeNamespaces: { namespace: string; vectorCount: number }[];
}

export function AvatarPineconeStatus() {
  const { data, isLoading, refetch } = useQuery<PineconeStatusResponse>({
    queryKey: ["/api/admin/avatars/pinecone-status"],
  });

  const getStatusIcon = (status: 'ok' | 'warning' | 'error') => {
    switch (status) {
      case 'ok':
        return <CheckCircle className="w-5 h-5 text-green-400" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-yellow-400" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-400" />;
    }
  };

  const getStatusColor = (status: 'ok' | 'warning' | 'error') => {
    switch (status) {
      case 'ok':
        return 'border-green-500/30 bg-green-500/10';
      case 'warning':
        return 'border-yellow-500/30 bg-yellow-500/10';
      case 'error':
        return 'border-red-500/30 bg-red-500/10';
    }
  };

  if (isLoading) {
    return (
      <Card className="glass-strong border-white/10">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
          <span className="ml-3 text-white/70">Checking avatar connections...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="glass-strong border-white/10">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-white flex items-center gap-2">
                <User className="w-5 h-5 text-purple-400" />
                Avatar-Pinecone Connection Status
              </CardTitle>
              <CardDescription className="text-white/60">
                Verify that avatars are correctly connected to their Pinecone namespaces
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="border-white/20 text-white hover:bg-white/10"
              data-testid="btn-refresh-avatar-status"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {data?.summary && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
              <div className="bg-white/5 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-white">{data.summary.totalAvatars}</div>
                <div className="text-xs text-white/60">Total Avatars</div>
              </div>
              <div className="bg-white/5 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-green-400">{data.summary.activeAvatars}</div>
                <div className="text-xs text-white/60">Active</div>
              </div>
              <div className="bg-purple-500/20 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-purple-400">{data.summary.pineconeOnlyCount}</div>
                <div className="text-xs text-white/60">Pinecone Only</div>
              </div>
              <div className="bg-yellow-500/20 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-yellow-400">{data.summary.withExternalSources}</div>
                <div className="text-xs text-white/60">External Sources</div>
              </div>
              <div className="bg-red-500/20 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-red-400">{data.summary.withIssues}</div>
                <div className="text-xs text-white/60">With Issues</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <ScrollArea className="h-[500px]">
        <div className="space-y-4">
          {data?.avatars?.map((avatar) => (
            <Card
              key={avatar.avatarId}
              className={`glass-strong border transition-all ${getStatusColor(avatar.status)}`}
              data-testid={`avatar-status-${avatar.avatarId}`}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(avatar.status)}
                    <div>
                      <CardTitle className="text-lg text-white">{avatar.avatarName}</CardTitle>
                      <CardDescription className="text-white/50 text-xs">
                        ID: {avatar.avatarId}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {avatar.isActive ? (
                      <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Active</Badge>
                    ) : (
                      <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/30">Inactive</Badge>
                    )}
                    {avatar.pineconeOnly && (
                      <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">
                        <Database className="w-3 h-3 mr-1" />
                        Pinecone Only
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {avatar.issues.length > 0 && (
                  <div className="space-y-1">
                    {avatar.issues.map((issue, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0" />
                        <span className="text-white/70">{issue}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div>
                  <div className="text-sm text-white/70 mb-2 flex items-center gap-2">
                    <Database className="w-4 h-4 text-purple-400" />
                    Pinecone Namespaces
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {avatar.namespaceStatus.length > 0 ? (
                      avatar.namespaceStatus.map((ns) => (
                        <Badge
                          key={ns.namespace}
                          variant="outline"
                          className={`${
                            ns.exists && ns.vectorCount > 0
                              ? 'border-green-500/50 bg-green-500/10 text-green-400'
                              : ns.exists
                              ? 'border-yellow-500/50 bg-yellow-500/10 text-yellow-400'
                              : 'border-red-500/50 bg-red-500/10 text-red-400'
                          }`}
                        >
                          {ns.namespace}
                          <span className="ml-1 opacity-70">
                            ({ns.exists ? ns.vectorCount.toLocaleString() : 'missing'})
                          </span>
                        </Badge>
                      ))
                    ) : (
                      <span className="text-sm text-white/50">No namespaces configured</span>
                    )}
                  </div>
                </div>

                {avatar.usesExternalSources && (
                  <div>
                    <div className="text-sm text-white/70 mb-2 flex items-center gap-2">
                      <ExternalLink className="w-4 h-4 text-cyan-400" />
                      External Data Sources
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {avatar.externalSources.map((source) => (
                        <Badge
                          key={source}
                          variant="outline"
                          className="border-cyan-500/50 bg-cyan-500/10 text-cyan-400"
                        >
                          {source}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
