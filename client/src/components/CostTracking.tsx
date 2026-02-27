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
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";

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
      <Card className="bg-gradient-to-br from-background via-background to-primary/5 border-primary/20">
        <CardHeader>
          <CardTitle className="text-2xl bg-gradient-to-r from-primary via-purple-500 to-pink-500 bg-clip-text text-transparent">
            API Cost Tracking
          </CardTitle>
          <CardDescription>Monitor API usage across all services</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              No API calls tracked yet. Make some requests to see usage statistics and distribution charts.
            </p>
          </div>
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

  // Premium color palette with gradients
  const getServiceColor = (serviceName: string): string => {
    const serviceColors: Record<string, string> = {
      claude: "hsl(271, 81%, 56%)", // Purple
      elevenlabs: "hsl(142, 76%, 36%)", // Green
      heygen: "hsl(217, 91%, 60%)", // Blue
      pinecone: "hsl(24, 95%, 53%)", // Orange
      openai: "hsl(171, 77%, 64%)", // Teal
    };
    return serviceColors[serviceName] || "hsl(0, 0%, 50%)";
  };

  // Calculate total calls across all services
  const totalCalls = stats.services.reduce((sum, service) => sum + service.total, 0);

  // Guard against zero total calls
  if (totalCalls === 0) {
    return (
      <Card className="bg-gradient-to-br from-background via-background to-primary/5 border-primary/20">
        <CardHeader>
          <CardTitle className="text-2xl bg-gradient-to-r from-primary via-purple-500 to-pink-500 bg-clip-text text-transparent">
            API Cost Tracking
          </CardTitle>
          <CardDescription>Monitor API usage across all services</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              No API calls tracked yet. Make some requests to see usage statistics and distribution charts.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Prepare data for pie chart
  const chartData = stats.services.map(service => ({
    name: getServiceDisplayName(service.serviceName),
    value: service.total,
    percentage: ((service.total / totalCalls) * 100).toFixed(1),
    color: getServiceColor(service.serviceName),
  }));

  return (
    <Card className="bg-gradient-to-br from-background via-background to-primary/5 border-primary/20">
      <CardHeader>
        <CardTitle className="text-2xl bg-gradient-to-r from-primary via-purple-500 to-pink-500 bg-clip-text text-transparent">
          API Cost Tracking
        </CardTitle>
        <CardDescription>Monitor API usage across all services</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Chart Section */}
          <div className="flex flex-col items-center justify-center">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ percentage }) => `${percentage}%`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value: number) => value.toLocaleString()}
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px'
                  }}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
            <div className="text-center mt-4">
              <p className="text-sm text-muted-foreground">Total API Calls</p>
              <p className="text-3xl font-bold bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">
                {totalCalls.toLocaleString()}
              </p>
            </div>
          </div>

          {/* Service Cards Section */}
          <div className="space-y-3">
            {stats.services.map((service) => {
              const percentage = ((service.total / totalCalls) * 100).toFixed(1);
              const serviceColor = getServiceColor(service.serviceName);
              
              return (
                <div 
                  key={service.serviceName}
                  className="relative group"
                  data-testid={`cost-row-${service.serviceName}`}
                >
                  <div 
                    className="absolute -inset-[1px] opacity-60 blur-sm group-hover:opacity-100 transition-opacity animate-gradient-xy rounded-lg"
                    style={{ 
                      background: `linear-gradient(90deg, ${serviceColor}, hsl(271, 91%, 65%), ${serviceColor})`
                    }}
                  />
                  <Card className="relative glass border-purple-500/20 shadow-lg group-hover:shadow-xl transition-all duration-300">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-1">
                          <div 
                            className="w-10 h-10 rounded-lg flex items-center justify-center shadow-lg animate-pulse-slow"
                            style={{ 
                              background: `linear-gradient(135deg, ${serviceColor}, ${serviceColor}dd)`,
                              boxShadow: `0 0 20px ${serviceColor}40`
                            }}
                          >
                            <div 
                              className="w-3 h-3 rounded-full bg-white"
                            />
                          </div>
                          <div>
                            <h3 className="font-semibold text-sm bg-gradient-to-r from-purple-500 via-cyan-500 to-purple-500 bg-clip-text text-transparent animate-gradient-text">
                              {getServiceDisplayName(service.serviceName)}
                            </h3>
                            <p className="text-xs text-muted-foreground">
                              {service.avgResponseTimeMs > 0 ? `${service.avgResponseTimeMs.toLocaleString()}ms avg` : 'No data'}
                            </p>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <div className="flex items-center gap-2">
                              <span className="text-2xl font-bold" style={{ color: serviceColor }}>
                                {percentage}%
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground">of total calls</p>
                          </div>
                          
                          <div className="text-right">
                            <p className="text-lg font-bold" data-testid={`total-${service.serviceName}`}>
                              {service.total.toLocaleString()}
                            </p>
                            <p className="text-xs text-muted-foreground" data-testid={`last24h-${service.serviceName}`}>
                              {service.last24h.toLocaleString()} in 24h
                            </p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
