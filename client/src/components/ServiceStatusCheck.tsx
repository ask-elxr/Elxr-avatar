import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, CheckCircle2, XCircle, AlertCircle, Clock } from "lucide-react";

interface ServiceStatus {
  name: string;
  status: 'healthy' | 'unhealthy' | 'error';
  responseTimeMs: number;
  message?: string;
  details?: Record<string, any>;
}

interface ServiceStatusResponse {
  timestamp: string;
  overall: 'healthy' | 'degraded' | 'unhealthy';
  healthyCount: number;
  totalCount: number;
  services: ServiceStatus[];
}

export function ServiceStatusCheck() {
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<ServiceStatusResponse>({
    queryKey: ['/api/admin/service-status'],
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'unhealthy':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'error':
        return <AlertCircle className="h-5 w-5 text-yellow-500" />;
      default:
        return <AlertCircle className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'healthy':
        return <Badge variant="default" className="bg-green-500 hover:bg-green-600">Healthy</Badge>;
      case 'unhealthy':
        return <Badge variant="destructive">Unhealthy</Badge>;
      case 'error':
        return <Badge variant="secondary" className="bg-yellow-500 text-white hover:bg-yellow-600">Error</Badge>;
      case 'degraded':
        return <Badge variant="secondary" className="bg-yellow-500 text-white hover:bg-yellow-600">Degraded</Badge>;
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  const getOverallStatusColor = (overall: string) => {
    switch (overall) {
      case 'healthy':
        return 'border-green-500 bg-green-50 dark:bg-green-950';
      case 'degraded':
        return 'border-yellow-500 bg-yellow-50 dark:bg-yellow-950';
      case 'unhealthy':
        return 'border-red-500 bg-red-50 dark:bg-red-950';
      default:
        return 'border-gray-500 bg-gray-50 dark:bg-gray-950';
    }
  };

  return (
    <Card data-testid="card-service-status">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Service Status</CardTitle>
            <CardDescription>
              Real-time health check of external services
            </CardDescription>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => refetch()}
            disabled={isFetching}
            data-testid="button-refresh-status"
          >
            {isFetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Checking services...</span>
          </div>
        ) : isError ? (
          <div className="flex items-center justify-center py-8 text-red-500">
            <AlertCircle className="h-5 w-5 mr-2" />
            <span>Failed to check services: {(error as Error)?.message || 'Unknown error'}</span>
          </div>
        ) : data ? (
          <div className="space-y-4">
            <div className={`p-3 rounded-lg border-2 ${getOverallStatusColor(data.overall)}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {getStatusIcon(data.overall)}
                  <span className="font-medium">
                    Overall Status: {getStatusBadge(data.overall)}
                  </span>
                </div>
                <span className="text-sm text-muted-foreground">
                  {data.healthyCount}/{data.totalCount} services healthy
                </span>
              </div>
            </div>

            <div className="space-y-2">
              {data.services.map((service) => (
                <div 
                  key={service.name}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                  data-testid={`service-status-${service.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
                >
                  <div className="flex items-center gap-3">
                    {getStatusIcon(service.status)}
                    <div>
                      <div className="font-medium">{service.name}</div>
                      {service.message && (
                        <div className="text-sm text-muted-foreground">
                          {service.message}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center text-sm text-muted-foreground">
                      <Clock className="h-3 w-3 mr-1" />
                      {service.responseTimeMs}ms
                    </div>
                    {getStatusBadge(service.status)}
                  </div>
                </div>
              ))}
            </div>

            <div className="text-xs text-muted-foreground text-right">
              Last checked: {new Date(data.timestamp).toLocaleTimeString()}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
