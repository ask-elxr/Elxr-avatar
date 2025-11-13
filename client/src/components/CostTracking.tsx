import { useQuery } from "@tanstack/react-query";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface CostStats {
  services: {
    serviceName: string;
    total: number;
    last24h: number;
    last7d: number;
    avgResponseTimeMs: number;
  }[];
}

export function CostTracking() {
  const { data: stats, isLoading } = useQuery<CostStats>({
    queryKey: ["/api/admin/costs"],
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>API Cost Tracking</CardTitle>
          <CardDescription>Monitor API usage across all services</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!stats || stats.services.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>API Cost Tracking</CardTitle>
          <CardDescription>Monitor API usage across all services</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No API calls tracked yet. Make some requests to see usage statistics.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Map service names to display names with fallback
  const getServiceDisplayName = (serviceName: string): string => {
    const serviceDisplayNames: Record<string, string> = {
      claude: "Claude Sonnet 4",
      elevenlabs: "ElevenLabs TTS",
      heygen: "HeyGen Avatar",
      pinecone: "Pinecone Vector DB",
      openai: "OpenAI Embeddings",
    };
    
    // Return mapped name or capitalize the raw service name as fallback
    return serviceDisplayNames[serviceName] || 
           serviceName.split('-').map(word => 
             word.charAt(0).toUpperCase() + word.slice(1)
           ).join(' ');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>API Cost Tracking</CardTitle>
        <CardDescription>Monitor API usage across all services</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Service</TableHead>
              <TableHead className="text-right">Total Calls</TableHead>
              <TableHead className="text-right">Last 24h</TableHead>
              <TableHead className="text-right">Last 7d</TableHead>
              <TableHead className="text-right">Avg Response (ms)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stats.services.map((service) => (
              <TableRow key={service.serviceName} data-testid={`cost-row-${service.serviceName}`}>
                <TableCell className="font-medium">
                  {getServiceDisplayName(service.serviceName)}
                </TableCell>
                <TableCell className="text-right" data-testid={`total-${service.serviceName}`}>
                  {service.total.toLocaleString()}
                </TableCell>
                <TableCell className="text-right" data-testid={`last24h-${service.serviceName}`}>
                  {service.last24h.toLocaleString()}
                </TableCell>
                <TableCell className="text-right" data-testid={`last7d-${service.serviceName}`}>
                  {service.last7d.toLocaleString()}
                </TableCell>
                <TableCell className="text-right" data-testid={`avg-response-${service.serviceName}`}>
                  {service.avgResponseTimeMs.toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
