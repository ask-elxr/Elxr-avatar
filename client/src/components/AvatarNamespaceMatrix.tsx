import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Database,
  RefreshCw,
  User,
  ExternalLink,
  Loader2,
  FileText,
  ChevronRight,
  X,
  Layers,
  Link2,
  BarChart3,
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

interface VectorData {
  id: string;
  metadata?: Record<string, any>;
}

interface NamespaceVectorsResponse {
  namespace: string;
  vectors: VectorData[];
  cursor?: string;
  hasMore: boolean;
}

export function AvatarNamespaceMatrix() {
  const [selectedNamespace, setSelectedNamespace] = useState<string | null>(null);
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'matrix' | 'list'>('matrix');

  const { data, isLoading, refetch } = useQuery<PineconeStatusResponse>({
    queryKey: ["/api/admin/avatars/pinecone-status"],
  });

  const { data: namespaceDetails, isLoading: loadingDetails } = useQuery<NamespaceVectorsResponse>({
    queryKey: [`/api/admin/pinecone/namespace/${selectedNamespace}/vectors`],
    enabled: !!selectedNamespace,
  });

  const allNamespaces = useMemo(() => {
    if (!data) return [];
    const nsSet = new Set<string>();
    data.avatars.forEach(avatar => {
      avatar.namespaceStatus.forEach(ns => nsSet.add(ns.namespace));
    });
    data.pineconeNamespaces?.forEach(ns => nsSet.add(ns.namespace));
    return Array.from(nsSet).sort();
  }, [data]);

  const namespaceToAvatarsMap = useMemo(() => {
    if (!data) return new Map<string, AvatarStatus[]>();
    const map = new Map<string, AvatarStatus[]>();
    allNamespaces.forEach(ns => map.set(ns, []));
    data.avatars.forEach(avatar => {
      avatar.namespaceStatus.forEach(ns => {
        const existing = map.get(ns.namespace) || [];
        existing.push(avatar);
        map.set(ns.namespace, existing);
      });
    });
    return map;
  }, [data, allNamespaces]);

  const getNamespaceStats = (namespace: string) => {
    const pns = data?.pineconeNamespaces?.find(ns => ns.namespace === namespace);
    return pns ? { exists: true, vectorCount: pns.vectorCount } : { exists: false, vectorCount: 0 };
  };

  const getCellColor = (avatar: AvatarStatus, namespace: string) => {
    const ns = avatar.namespaceStatus.find(n => n.namespace === namespace);
    if (!ns) return 'bg-transparent';
    if (!ns.exists) return 'bg-red-500/30 border border-red-500/50';
    if (ns.vectorCount === 0) return 'bg-yellow-500/30 border border-yellow-500/50';
    return 'bg-green-500/30 border border-green-500/50';
  };

  const hasConnection = (avatar: AvatarStatus, namespace: string) => {
    return avatar.namespaceStatus.some(ns => ns.namespace === namespace);
  };

  const getContentTypeSummary = (vectors: VectorData[] | undefined) => {
    if (!vectors || vectors.length === 0) return {};
    const types: Record<string, number> = {};
    vectors.forEach(v => {
      const source = v.metadata?.source || v.metadata?.type || 'unknown';
      types[source] = (types[source] || 0) + 1;
    });
    return types;
  };

  const getSampleTexts = (vectors: VectorData[] | undefined) => {
    if (!vectors) return [];
    return vectors
      .filter(v => v.metadata?.text)
      .slice(0, 3)
      .map(v => ({
        id: v.id,
        text: v.metadata?.text?.substring(0, 200) + (v.metadata?.text?.length > 200 ? '...' : ''),
        source: v.metadata?.source || v.metadata?.fileName || 'Unknown source',
      }));
  };

  if (isLoading) {
    return (
      <Card className="glass-strong border-white/10">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
          <span className="ml-3 text-white/70">Loading avatar-namespace data...</span>
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
                <Link2 className="w-5 h-5 text-purple-400" />
                Avatar-Namespace Relationship Map
              </CardTitle>
              <CardDescription className="text-white/60">
                Visualize which Pinecone namespaces each avatar uses and explore namespace contents
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant={viewMode === 'matrix' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('matrix')}
                className={viewMode === 'matrix' ? 'bg-purple-600' : 'border-white/20 text-white hover:bg-white/10'}
                data-testid="btn-view-matrix"
              >
                <Layers className="w-4 h-4 mr-1" />
                Matrix
              </Button>
              <Button
                variant={viewMode === 'list' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('list')}
                className={viewMode === 'list' ? 'bg-purple-600' : 'border-white/20 text-white hover:bg-white/10'}
                data-testid="btn-view-list"
              >
                <BarChart3 className="w-4 h-4 mr-1" />
                List
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                className="border-white/20 text-white hover:bg-white/10"
                data-testid="btn-refresh-matrix"
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {data?.summary && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6" data-testid="summary-stats">
              <div className="bg-white/5 rounded-lg p-3 text-center" data-testid="stat-total-avatars">
                <div className="text-xl font-bold text-white" data-testid="value-total-avatars">{data.summary.totalAvatars}</div>
                <div className="text-xs text-white/60">Avatars</div>
              </div>
              <div className="bg-white/5 rounded-lg p-3 text-center" data-testid="stat-namespaces">
                <div className="text-xl font-bold text-purple-400" data-testid="value-namespaces">{allNamespaces.length}</div>
                <div className="text-xs text-white/60">Namespaces</div>
              </div>
              <div className="bg-green-500/20 rounded-lg p-3 text-center" data-testid="stat-active">
                <div className="text-xl font-bold text-green-400" data-testid="value-active">{data.summary.activeAvatars}</div>
                <div className="text-xs text-white/60">Active</div>
              </div>
              <div className="bg-purple-500/20 rounded-lg p-3 text-center" data-testid="stat-pinecone-only">
                <div className="text-xl font-bold text-purple-400" data-testid="value-pinecone-only">{data.summary.pineconeOnlyCount}</div>
                <div className="text-xs text-white/60">Pinecone Only</div>
              </div>
              <div className="bg-red-500/20 rounded-lg p-3 text-center" data-testid="stat-issues">
                <div className="text-xl font-bold text-red-400" data-testid="value-issues">{data.summary.withIssues}</div>
                <div className="text-xs text-white/60">Issues</div>
              </div>
            </div>
          )}

          <div className="mb-4" data-testid="legend-container">
            <div className="flex items-center gap-4 text-xs text-white/60">
              <span className="font-medium">Legend:</span>
              <div className="flex items-center gap-1" data-testid="legend-connected">
                <div className="w-4 h-4 bg-green-500/30 border border-green-500/50 rounded" />
                <span>Connected (has vectors)</span>
              </div>
              <div className="flex items-center gap-1" data-testid="legend-empty">
                <div className="w-4 h-4 bg-yellow-500/30 border border-yellow-500/50 rounded" />
                <span>Empty namespace</span>
              </div>
              <div className="flex items-center gap-1" data-testid="legend-missing">
                <div className="w-4 h-4 bg-red-500/30 border border-red-500/50 rounded" />
                <span>Missing namespace</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className={selectedNamespace ? 'lg:col-span-2' : 'lg:col-span-3'}>
          {viewMode === 'matrix' ? (
            <Card className="glass-strong border-white/10 overflow-hidden">
              <CardHeader className="py-3">
                <CardTitle className="text-sm text-white/80">Relationship Matrix</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[500px]">
                  <div className="min-w-max">
                    <table className="w-full border-collapse">
                      <thead className="sticky top-0 z-10 bg-black/80 backdrop-blur">
                        <tr>
                          <th className="p-2 text-left text-xs font-medium text-white/60 border-b border-white/10 min-w-[150px]">
                            Avatar
                          </th>
                          {allNamespaces.map(ns => (
                            <th
                              key={ns}
                              className={`p-2 text-center text-xs font-medium border-b border-white/10 cursor-pointer transition-colors ${
                                selectedNamespace === ns 
                                  ? 'text-purple-400 bg-purple-500/20' 
                                  : 'text-white/60 hover:text-white hover:bg-white/5'
                              }`}
                              onClick={() => setSelectedNamespace(selectedNamespace === ns ? null : ns)}
                              data-testid={`header-namespace-${ns}`}
                            >
                              <div className="writing-mode-vertical transform -rotate-45 origin-center whitespace-nowrap text-[10px]">
                                {ns}
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data?.avatars?.map(avatar => (
                          <tr
                            key={avatar.avatarId}
                            className={`border-b border-white/5 hover:bg-white/5 transition-colors ${
                              selectedAvatar === avatar.avatarId ? 'bg-purple-500/10' : ''
                            }`}
                            onClick={() => setSelectedAvatar(selectedAvatar === avatar.avatarId ? null : avatar.avatarId)}
                            data-testid={`row-avatar-${avatar.avatarId}`}
                          >
                            <td className="p-2">
                              <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${avatar.isActive ? 'bg-green-400' : 'bg-gray-400'}`} />
                                <span className="text-sm text-white font-medium">{avatar.avatarName}</span>
                                {avatar.usesExternalSources && (
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <ExternalLink className="w-3 h-3 text-cyan-400" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      Uses: {avatar.externalSources.join(', ')}
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                              </div>
                            </td>
                            {allNamespaces.map(ns => (
                              <td
                                key={ns}
                                className="p-1 text-center"
                                data-testid={`td-${avatar.avatarId}-${ns}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (hasConnection(avatar, ns)) {
                                    setSelectedNamespace(ns);
                                  }
                                }}
                              >
                                {hasConnection(avatar, ns) ? (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div
                                        className={`w-6 h-6 mx-auto rounded cursor-pointer transition-transform hover:scale-110 ${getCellColor(avatar, ns)}`}
                                        data-testid={`cell-${avatar.avatarId}-${ns}`}
                                      />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <div className="text-xs">
                                        <div className="font-medium">{avatar.avatarName} → {ns}</div>
                                        <div className="text-white/60">
                                          {avatar.namespaceStatus.find(n => n.namespace === ns)?.vectorCount.toLocaleString() || 0} vectors
                                        </div>
                                      </div>
                                    </TooltipContent>
                                  </Tooltip>
                                ) : (
                                  <div className="w-6 h-6 mx-auto" />
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="sticky bottom-0 bg-black/80 backdrop-blur border-t border-white/10" data-testid="matrix-footer">
                        <tr data-testid="footer-totals-row">
                          <td className="p-2 text-xs text-white/60 font-medium">Total Vectors</td>
                          {allNamespaces.map(ns => {
                            const stats = getNamespaceStats(ns);
                            return (
                              <td key={ns} className="p-1 text-center" data-testid={`footer-cell-${ns}`}>
                                <span 
                                  className={`text-xs ${stats.vectorCount > 0 ? 'text-green-400' : 'text-white/40'}`}
                                  data-testid={`footer-value-${ns}`}
                                >
                                  {stats.vectorCount > 0 ? stats.vectorCount.toLocaleString() : '-'}
                                </span>
                              </td>
                            );
                          })}
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          ) : (
            <Card className="glass-strong border-white/10">
              <CardHeader className="py-3">
                <CardTitle className="text-sm text-white/80">Namespace List</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  <div className="space-y-3">
                    {allNamespaces.map(ns => {
                      const stats = getNamespaceStats(ns);
                      const connectedAvatars = namespaceToAvatarsMap.get(ns) || [];
                      
                      return (
                        <div
                          key={ns}
                          className={`p-4 rounded-lg border cursor-pointer transition-all ${
                            selectedNamespace === ns 
                              ? 'border-purple-500 bg-purple-500/20' 
                              : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'
                          }`}
                          onClick={() => setSelectedNamespace(selectedNamespace === ns ? null : ns)}
                          data-testid={`namespace-card-${ns}`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Database className="w-4 h-4 text-purple-400" />
                              <span className="font-medium text-white">{ns}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge 
                                variant="outline" 
                                className={
                                  stats.vectorCount > 0 
                                    ? 'border-green-500/50 text-green-400 bg-green-500/10'
                                    : 'border-yellow-500/50 text-yellow-400 bg-yellow-500/10'
                                }
                                data-testid={`list-badge-vectors-${ns}`}
                              >
                                {stats.vectorCount.toLocaleString()} vectors
                              </Badge>
                              <ChevronRight className={`w-4 h-4 text-white/40 transition-transform ${
                                selectedNamespace === ns ? 'rotate-90' : ''
                              }`} />
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1" data-testid={`list-avatars-${ns}`}>
                            {connectedAvatars.map(avatar => (
                              <Badge
                                key={avatar.avatarId}
                                variant="outline"
                                className="text-xs border-white/20 bg-white/5"
                                data-testid={`badge-avatar-${avatar.avatarId}-ns-${ns}`}
                              >
                                <User className="w-3 h-3 mr-1" />
                                {avatar.avatarName}
                              </Badge>
                            ))}
                            {connectedAvatars.length === 0 && (
                              <span className="text-xs text-white/40 italic" data-testid={`list-no-avatars-${ns}`}>No avatars connected</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </div>

        {selectedNamespace && (
          <Card className="glass-strong border-purple-500/30 lg:col-span-1">
            <CardHeader className="py-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm text-white flex items-center gap-2">
                  <Database className="w-4 h-4 text-purple-400" />
                  {selectedNamespace}
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedNamespace(null)}
                  className="h-6 w-6 p-0 text-white/40 hover:text-white"
                  data-testid="btn-close-namespace-detail"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loadingDetails ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
                </div>
              ) : (
                <div className="space-y-4" data-testid="namespace-detail-content">
                  <div className="grid grid-cols-2 gap-2" data-testid="namespace-detail-stats">
                    <div className="bg-white/5 rounded-lg p-2 text-center" data-testid="detail-stat-vectors">
                      <div className="text-lg font-bold text-white" data-testid="detail-value-vectors">
                        {getNamespaceStats(selectedNamespace).vectorCount.toLocaleString()}
                      </div>
                      <div className="text-xs text-white/60">Total Vectors</div>
                    </div>
                    <div className="bg-white/5 rounded-lg p-2 text-center" data-testid="detail-stat-avatars">
                      <div className="text-lg font-bold text-purple-400" data-testid="detail-value-avatars">
                        {(namespaceToAvatarsMap.get(selectedNamespace) || []).length}
                      </div>
                      <div className="text-xs text-white/60">Avatars</div>
                    </div>
                  </div>

                  <div data-testid="detail-connected-avatars">
                    <div className="text-xs text-white/60 mb-2 flex items-center gap-1">
                      <User className="w-3 h-3" />
                      Connected Avatars
                    </div>
                    <div className="flex flex-wrap gap-1" data-testid="detail-avatar-list">
                      {(namespaceToAvatarsMap.get(selectedNamespace) || []).map(avatar => (
                        <Badge
                          key={avatar.avatarId}
                          variant="outline"
                          className={`text-xs ${
                            avatar.isActive 
                              ? 'border-green-500/50 text-green-400 bg-green-500/10'
                              : 'border-gray-500/50 text-gray-400 bg-gray-500/10'
                          }`}
                          data-testid={`detail-avatar-${avatar.avatarId}`}
                        >
                          {avatar.avatarName}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {namespaceDetails?.vectors && namespaceDetails.vectors.length > 0 && (
                    <>
                      <div data-testid="detail-content-sources">
                        <div className="text-xs text-white/60 mb-2 flex items-center gap-1">
                          <Layers className="w-3 h-3" />
                          Content Sources
                        </div>
                        <div className="flex flex-wrap gap-1" data-testid="detail-source-list">
                          {Object.entries(getContentTypeSummary(namespaceDetails.vectors)).map(([type, count]) => (
                            <Badge
                              key={type}
                              variant="outline"
                              className="text-xs border-cyan-500/50 text-cyan-400 bg-cyan-500/10"
                              data-testid={`detail-source-${type}`}
                            >
                              {type}: {count}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      <div data-testid="detail-sample-content">
                        <div className="text-xs text-white/60 mb-2 flex items-center gap-1">
                          <FileText className="w-3 h-3" />
                          Sample Content
                        </div>
                        <ScrollArea className="h-[200px]">
                          <div className="space-y-2" data-testid="detail-sample-list">
                            {getSampleTexts(namespaceDetails.vectors).map((sample, idx) => (
                              <div
                                key={idx}
                                className="p-2 rounded bg-white/5 border border-white/10"
                                data-testid={`detail-sample-${idx}`}
                              >
                                <div className="text-xs text-purple-400 mb-1" data-testid={`detail-sample-source-${idx}`}>{sample.source}</div>
                                <div className="text-xs text-white/70 leading-relaxed" data-testid={`detail-sample-text-${idx}`}>
                                  {sample.text}
                                </div>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      </div>
                    </>
                  )}

                  {(!namespaceDetails?.vectors || namespaceDetails.vectors.length === 0) && (
                    <div className="text-center py-6 text-white/40">
                      <Database className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <div className="text-sm">No vectors in this namespace</div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
