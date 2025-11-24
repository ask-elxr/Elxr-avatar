import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { DollarSign, TrendingUp, Activity, AlertCircle } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell, LineChart, Line } from "recharts";

interface CreditStats {
  limit: number;
  totalUsed: number;
  remaining: number;
  last24h: number;
  last7d: number;
  warningThreshold: number;
  criticalThreshold: number;
  status: 'ok' | 'warning' | 'critical';
}

export default function Credits() {
  const { data: heygenStats, isLoading: heygenLoading } = useQuery<CreditStats>({
    queryKey: ['/api/heygen/credits'],
    refetchInterval: 30000,
  });

  // Placeholder for other services - you can implement these endpoints later
  const claudeStats = {
    limit: 1000000,
    totalUsed: 450000,
    remaining: 550000,
    last24h: 15000,
    last7d: 85000,
    status: 'ok' as const,
  };

  const elevenlabsStats = {
    limit: 500000,
    totalUsed: 120000,
    remaining: 380000,
    last24h: 5000,
    last7d: 25000,
    status: 'ok' as const,
  };

  if (heygenLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // Data for service comparison chart
  const comparisonData = [
    {
      name: 'HeyGen',
      used: heygenStats?.totalUsed || 0,
      remaining: heygenStats?.remaining || 0,
      limit: heygenStats?.limit || 0,
    },
    {
      name: 'Claude',
      used: claudeStats.totalUsed,
      remaining: claudeStats.remaining,
      limit: claudeStats.limit,
    },
    {
      name: 'ElevenLabs',
      used: elevenlabsStats.totalUsed,
      remaining: elevenlabsStats.remaining,
      limit: elevenlabsStats.limit,
    },
  ];

  // Data for usage trend chart
  const usageTrendData = [
    { period: '24h', HeyGen: heygenStats?.last24h || 0, Claude: claudeStats.last24h, ElevenLabs: elevenlabsStats.last24h },
    { period: '7d', HeyGen: heygenStats?.last7d || 0, Claude: claudeStats.last7d, ElevenLabs: elevenlabsStats.last7d },
  ];

  // Data for pie charts
  const heygenPieData = [
    { name: 'Used', value: heygenStats?.totalUsed || 0 },
    { name: 'Remaining', value: heygenStats?.remaining || 0 },
  ];

  const claudePieData = [
    { name: 'Used', value: claudeStats.totalUsed },
    { name: 'Remaining', value: claudeStats.remaining },
  ];

  const elevenlabsPieData = [
    { name: 'Used', value: elevenlabsStats.totalUsed },
    { name: 'Remaining', value: elevenlabsStats.remaining },
  ];

  const COLORS = {
    used: '#8b5cf6',
    remaining: '#10b981',
    heygen: '#3b82f6',
    claude: '#f59e0b',
    elevenlabs: '#ec4899',
  };

  const getStatusBadge = (status: string) => {
    const badges = {
      ok: { bg: 'bg-green-950/30', text: 'text-green-400', border: 'border-green-600/30', label: '✓ Healthy' },
      warning: { bg: 'bg-yellow-950/30', text: 'text-yellow-400', border: 'border-yellow-600/30', label: '⚠ Warning' },
      critical: { bg: 'bg-red-950/30', text: 'text-red-400', border: 'border-red-600/30', label: '✖ Critical' },
    };
    const badge = badges[status as keyof typeof badges] || badges.ok;
    return (
      <div className={`px-3 py-1 rounded-full text-sm font-medium border ${badge.bg} ${badge.text} ${badge.border}`}>
        {badge.label}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Credit Monitoring</h1>
          <p className="text-muted-foreground">
            Track and monitor API credit usage across all services
          </p>
        </div>

        {/* Overview Cards */}
        <div className="grid gap-6 md:grid-cols-3">
          {/* HeyGen */}
          <Card className="border-blue-600/30">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-blue-400" />
                  HeyGen
                </CardTitle>
                {heygenStats && getStatusBadge(heygenStats.status)}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Used</p>
                  <p className="text-2xl font-bold text-blue-400">{heygenStats?.totalUsed.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Remaining</p>
                  <p className="text-2xl font-bold text-green-400">{heygenStats?.remaining.toLocaleString()}</p>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Progress</span>
                  <span>{heygenStats ? ((heygenStats.totalUsed / heygenStats.limit) * 100).toFixed(1) : 0}%</span>
                </div>
                <div className="w-full bg-gray-800 rounded-full h-2">
                  <div 
                    className="h-2 rounded-full bg-blue-500 transition-all"
                    style={{ width: `${heygenStats ? Math.min((heygenStats.totalUsed / heygenStats.limit) * 100, 100) : 0}%` }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Claude */}
          <Card className="border-orange-600/30">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Activity className="w-5 h-5 text-orange-400" />
                  Claude AI
                </CardTitle>
                {getStatusBadge(claudeStats.status)}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Used</p>
                  <p className="text-2xl font-bold text-orange-400">{claudeStats.totalUsed.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Remaining</p>
                  <p className="text-2xl font-bold text-green-400">{claudeStats.remaining.toLocaleString()}</p>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Progress</span>
                  <span>{((claudeStats.totalUsed / claudeStats.limit) * 100).toFixed(1)}%</span>
                </div>
                <div className="w-full bg-gray-800 rounded-full h-2">
                  <div 
                    className="h-2 rounded-full bg-orange-500 transition-all"
                    style={{ width: `${Math.min((claudeStats.totalUsed / claudeStats.limit) * 100, 100)}%` }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ElevenLabs */}
          <Card className="border-pink-600/30">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-pink-400" />
                  ElevenLabs
                </CardTitle>
                {getStatusBadge(elevenlabsStats.status)}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Used</p>
                  <p className="text-2xl font-bold text-pink-400">{elevenlabsStats.totalUsed.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Remaining</p>
                  <p className="text-2xl font-bold text-green-400">{elevenlabsStats.remaining.toLocaleString()}</p>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Progress</span>
                  <span>{((elevenlabsStats.totalUsed / elevenlabsStats.limit) * 100).toFixed(1)}%</span>
                </div>
                <div className="w-full bg-gray-800 rounded-full h-2">
                  <div 
                    className="h-2 rounded-full bg-pink-500 transition-all"
                    style={{ width: `${Math.min((elevenlabsStats.totalUsed / elevenlabsStats.limit) * 100, 100)}%` }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Service Comparison Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Service Comparison</CardTitle>
            <CardDescription>Compare credit usage across all services</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={comparisonData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="name" stroke="#9ca3af" />
                <YAxis stroke="#9ca3af" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1f2937', 
                    border: '1px solid #374151',
                    borderRadius: '8px',
                    color: '#f9fafb'
                  }}
                />
                <Legend />
                <Bar dataKey="used" fill={COLORS.used} name="Used Credits" />
                <Bar dataKey="remaining" fill={COLORS.remaining} name="Remaining Credits" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Usage Distribution */}
        <div className="grid gap-6 md:grid-cols-3">
          {/* HeyGen Pie Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">HeyGen Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={heygenPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    <Cell fill={COLORS.used} />
                    <Cell fill={COLORS.remaining} />
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#1f2937', 
                      border: '1px solid #374151',
                      borderRadius: '8px'
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex justify-center gap-4 mt-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.used }} />
                  <span>Used</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.remaining }} />
                  <span>Remaining</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Claude Pie Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Claude Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={claudePieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    <Cell fill={COLORS.claude} />
                    <Cell fill={COLORS.remaining} />
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#1f2937', 
                      border: '1px solid #374151',
                      borderRadius: '8px'
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex justify-center gap-4 mt-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.claude }} />
                  <span>Used</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.remaining }} />
                  <span>Remaining</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ElevenLabs Pie Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">ElevenLabs Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={elevenlabsPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    <Cell fill={COLORS.elevenlabs} />
                    <Cell fill={COLORS.remaining} />
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#1f2937', 
                      border: '1px solid #374151',
                      borderRadius: '8px'
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex justify-center gap-4 mt-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.elevenlabs }} />
                  <span>Used</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.remaining }} />
                  <span>Remaining</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Usage Trends */}
        <Card>
          <CardHeader>
            <CardTitle>Usage Trends</CardTitle>
            <CardDescription>Recent credit usage across all services</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={usageTrendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="period" stroke="#9ca3af" />
                <YAxis stroke="#9ca3af" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1f2937', 
                    border: '1px solid #374151',
                    borderRadius: '8px',
                    color: '#f9fafb'
                  }}
                />
                <Legend />
                <Line type="monotone" dataKey="HeyGen" stroke={COLORS.heygen} strokeWidth={2} />
                <Line type="monotone" dataKey="Claude" stroke={COLORS.claude} strokeWidth={2} />
                <Line type="monotone" dataKey="ElevenLabs" stroke={COLORS.elevenlabs} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Alert Information */}
        {heygenStats && heygenStats.status !== 'ok' && (
          <Card className="border-yellow-600/50 bg-yellow-950/10">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2 text-yellow-400">
                <AlertCircle className="w-5 h-5" />
                Credit Alert
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                HeyGen credits are running low. Current status: <strong>{heygenStats.status}</strong>. 
                Only {heygenStats.remaining.toLocaleString()} credits remaining out of {heygenStats.limit.toLocaleString()}.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
