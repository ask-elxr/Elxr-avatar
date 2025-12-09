import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { DollarSign, TrendingUp, Activity, AlertCircle } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell, LineChart, Line } from "recharts";

interface HeygenCreditStats {
  limit: number;
  totalUsed: number;
  remaining: number;
  last24h: number;
  last7d: number;
  warningThreshold: number;
  criticalThreshold: number;
  status: 'ok' | 'warning' | 'critical';
}

interface ClaudeUsageStats {
  totalCalls: number;
  last24h: number;
  last7d: number;
  avgResponseTimeMs: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedCostUsed: number;
  note: string;
  status: 'ok' | 'warning' | 'critical';
}

interface ElevenLabsUsageStats {
  totalCalls: number;
  last24h: number;
  last7d: number;
  avgResponseTimeMs: number;
  subscription: {
    tier: string;
    characterCount: number;
    characterLimit: number;
    charactersRemaining: number;
    usagePercent: number;
  } | null;
  status: 'ok' | 'warning' | 'critical';
}

export default function Credits() {
  const { data: heygenStats, isLoading: heygenLoading } = useQuery<HeygenCreditStats>({
    queryKey: ['/api/heygen/credits'],
    refetchInterval: 30000,
  });

  const { data: claudeStats, isLoading: claudeLoading } = useQuery<ClaudeUsageStats>({
    queryKey: ['/api/claude/credits'],
    refetchInterval: 30000,
  });

  const { data: elevenlabsStats, isLoading: elevenlabsLoading } = useQuery<ElevenLabsUsageStats>({
    queryKey: ['/api/elevenlabs/credits'],
    refetchInterval: 30000,
  });

  if (heygenLoading || claudeLoading || elevenlabsLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // Data for service comparison chart - showing API calls
  const comparisonData = [
    {
      name: 'HeyGen',
      used: heygenStats?.totalUsed || 0,
      remaining: heygenStats?.remaining || 0,
    },
    {
      name: 'Claude',
      used: claudeStats?.totalCalls || 0,
      remaining: 0,
    },
    {
      name: 'ElevenLabs',
      used: elevenlabsStats?.totalCalls || 0,
      remaining: 0,
    },
  ];

  // Data for usage trend chart
  const usageTrendData = [
    { period: '24h', HeyGen: heygenStats?.last24h || 0, Claude: claudeStats?.last24h || 0, ElevenLabs: elevenlabsStats?.last24h || 0 },
    { period: '7d', HeyGen: heygenStats?.last7d || 0, Claude: claudeStats?.last7d || 0, ElevenLabs: elevenlabsStats?.last7d || 0 },
  ];

  // Data for pie charts
  const heygenPieData = [
    { name: 'Used', value: heygenStats?.totalUsed || 0 },
    { name: 'Remaining', value: heygenStats?.remaining || 0 },
  ];

  // For Claude and ElevenLabs, show usage distribution by time period
  const claudePieData = [
    { name: '24h', value: claudeStats?.last24h || 0 },
    { name: '7d (excl. 24h)', value: Math.max(0, (claudeStats?.last7d || 0) - (claudeStats?.last24h || 0)) },
    { name: 'Older', value: Math.max(0, (claudeStats?.totalCalls || 0) - (claudeStats?.last7d || 0)) },
  ];

  // ElevenLabs pie data - show characters used/remaining if subscription available
  const elevenlabsPieData = elevenlabsStats?.subscription ? [
    { name: 'Used', value: elevenlabsStats.subscription.characterCount },
    { name: 'Remaining', value: elevenlabsStats.subscription.charactersRemaining },
  ] : [
    { name: '24h', value: elevenlabsStats?.last24h || 0 },
    { name: '7d (excl. 24h)', value: Math.max(0, (elevenlabsStats?.last7d || 0) - (elevenlabsStats?.last24h || 0)) },
    { name: 'Older', value: Math.max(0, (elevenlabsStats?.totalCalls || 0) - (elevenlabsStats?.last7d || 0)) },
  ];

  const COLORS = {
    used: '#64748b',
    remaining: '#06b6d4',
    heygen: '#0ea5e9',
    claude: '#8b5cf6',
    elevenlabs: '#14b8a6',
    period24h: '#ef4444',
    period7d: '#f59e0b',
    older: '#6b7280',
  };

  const getStatusBadge = (status: string) => {
    const badges = {
      ok: { bg: 'bg-green-100 dark:bg-green-900/20', text: 'text-green-700 dark:text-green-300', border: 'border-green-200 dark:border-green-800', label: 'Healthy' },
      warning: { bg: 'bg-yellow-100 dark:bg-yellow-900/20', text: 'text-yellow-700 dark:text-yellow-300', border: 'border-yellow-200 dark:border-yellow-800', label: 'Warning' },
      critical: { bg: 'bg-red-100 dark:bg-red-900/20', text: 'text-red-700 dark:text-red-300', border: 'border-red-200 dark:border-red-800', label: 'Critical' },
    };
    const badge = badges[status as keyof typeof badges] || badges.ok;
    return (
      <div className={`px-3 py-1 rounded-md text-xs font-medium border ${badge.bg} ${badge.text} ${badge.border}`}>
        {badge.label}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-semibold mb-2 text-foreground">Credit Monitoring</h1>
          <p className="text-sm text-muted-foreground">
            Track and monitor API credit usage across all services
          </p>
        </div>

        {/* Overview Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          {/* HeyGen */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-muted-foreground" />
                  HeyGen
                </CardTitle>
                {heygenStats && getStatusBadge(heygenStats.status)}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Used</p>
                  <p className="text-xl font-semibold text-foreground">{heygenStats?.totalUsed.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Remaining</p>
                  <p className="text-xl font-semibold text-foreground">{heygenStats?.remaining.toLocaleString()}</p>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Usage</span>
                  <span className="font-medium">{heygenStats ? ((heygenStats.totalUsed / heygenStats.limit) * 100).toFixed(1) : 0}%</span>
                </div>
                <div className="w-full bg-muted rounded-full h-1.5">
                  <div 
                    className="h-1.5 rounded-full bg-primary transition-all"
                    style={{ width: `${heygenStats ? Math.min((heygenStats.totalUsed / heygenStats.limit) * 100, 100) : 0}%` }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Claude */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Activity className="w-4 h-4 text-muted-foreground" />
                  Claude AI
                </CardTitle>
                {claudeStats && getStatusBadge(claudeStats.status)}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Est. Cost Used</p>
                  <p className="text-xl font-semibold text-foreground">${(claudeStats?.estimatedCostUsed || 0).toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Total Calls</p>
                  <p className="text-xl font-semibold text-foreground">{(claudeStats?.totalCalls || 0).toLocaleString()}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Input Tokens</p>
                  <p className="font-medium text-foreground">{((claudeStats?.estimatedInputTokens || 0) / 1000).toFixed(0)}K</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Output Tokens</p>
                  <p className="font-medium text-foreground">{((claudeStats?.estimatedOutputTokens || 0) / 1000).toFixed(0)}K</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground italic">Check console.anthropic.com for actual balance</p>
            </CardContent>
          </Card>

          {/* ElevenLabs */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-muted-foreground" />
                  ElevenLabs
                  {elevenlabsStats?.subscription && (
                    <span className="text-xs font-normal text-muted-foreground capitalize">({elevenlabsStats.subscription.tier})</span>
                  )}
                </CardTitle>
                {elevenlabsStats && getStatusBadge(elevenlabsStats.status)}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {elevenlabsStats?.subscription ? (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Characters Used</p>
                      <p className="text-xl font-semibold text-foreground">{elevenlabsStats.subscription.characterCount.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Remaining</p>
                      <p className="text-xl font-semibold text-foreground">{elevenlabsStats.subscription.charactersRemaining.toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>Usage ({elevenlabsStats.subscription.characterLimit.toLocaleString()} limit)</span>
                      <span className="font-medium">{elevenlabsStats.subscription.usagePercent}%</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-1.5">
                      <div 
                        className={`h-1.5 rounded-full transition-all ${
                          elevenlabsStats.subscription.usagePercent > 90 ? 'bg-red-500' :
                          elevenlabsStats.subscription.usagePercent > 70 ? 'bg-yellow-500' : 'bg-primary'
                        }`}
                        style={{ width: `${Math.min(elevenlabsStats.subscription.usagePercent, 100)}%` }}
                      />
                    </div>
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Total Calls</p>
                    <p className="text-xl font-semibold text-foreground">{(elevenlabsStats?.totalCalls || 0).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Last 24h</p>
                    <p className="text-xl font-semibold text-foreground">{(elevenlabsStats?.last24h || 0).toLocaleString()}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Service Comparison Chart */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Service Comparison</CardTitle>
            <CardDescription className="text-sm">Compare credit usage across all services</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={comparisonData} margin={{ left: 20, right: 20, top: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:stroke-slate-700" opacity={0.3} />
                <XAxis dataKey="name" stroke="#64748b" tick={{ fontSize: 12 }} />
                <YAxis 
                  stroke="#64748b" 
                  width={60}
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => {
                    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
                    if (value >= 1000) return `${(value / 1000).toFixed(0)}k`;
                    return value.toString();
                  }}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    color: 'hsl(var(--foreground))'
                  }}
                  formatter={(value: number) => value.toLocaleString()}
                />
                <Legend />
                <Bar dataKey="used" fill={COLORS.used} name="Used Credits" />
                <Bar dataKey="remaining" fill={COLORS.remaining} name="Remaining Credits" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Usage Distribution */}
        <div className="grid gap-4 md:grid-cols-3">
          {/* HeyGen Pie Chart */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">HeyGen Distribution</CardTitle>
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
                    activeIndex={undefined}
                    activeShape={{
                      fill: undefined,
                      stroke: 'hsl(var(--foreground))',
                      strokeWidth: 2,
                      filter: 'brightness(1.1)'
                    }}
                  >
                    <Cell fill={COLORS.used} stroke="transparent" />
                    <Cell fill={COLORS.remaining} stroke="transparent" />
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                    itemStyle={{ color: 'hsl(var(--foreground))' }}
                    formatter={(value: number, name: string) => [value.toLocaleString(), name]}
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
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Claude Usage by Period</CardTitle>
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
                    <Cell fill={COLORS.period24h} stroke="transparent" />
                    <Cell fill={COLORS.period7d} stroke="transparent" />
                    <Cell fill={COLORS.older} stroke="transparent" />
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                    itemStyle={{ color: 'hsl(var(--foreground))' }}
                    formatter={(value: number, name: string) => [`${value.toLocaleString()} calls`, name]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex justify-center gap-3 mt-4 text-xs">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS.period24h }} />
                  <span>24h</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS.period7d }} />
                  <span>7d</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS.older }} />
                  <span>Older</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ElevenLabs Pie Chart */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">
                {elevenlabsStats?.subscription ? 'ElevenLabs Credit Usage' : 'ElevenLabs Usage by Period'}
              </CardTitle>
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
                    {elevenlabsStats?.subscription ? (
                      <>
                        <Cell fill={COLORS.used} stroke="transparent" />
                        <Cell fill={COLORS.remaining} stroke="transparent" />
                      </>
                    ) : (
                      <>
                        <Cell fill={COLORS.period24h} stroke="transparent" />
                        <Cell fill={COLORS.period7d} stroke="transparent" />
                        <Cell fill={COLORS.older} stroke="transparent" />
                      </>
                    )}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                    itemStyle={{ color: 'hsl(var(--foreground))' }}
                    formatter={(value: number, name: string) => [
                      `${value.toLocaleString()} ${elevenlabsStats?.subscription ? 'chars' : 'calls'}`, 
                      name
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex justify-center gap-3 mt-4 text-xs">
                {elevenlabsStats?.subscription ? (
                  <>
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS.used }} />
                      <span>Used</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS.remaining }} />
                      <span>Remaining</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS.period24h }} />
                      <span>24h</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS.period7d }} />
                      <span>7d</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS.older }} />
                      <span>Older</span>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Usage Trends */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Usage Trends</CardTitle>
            <CardDescription className="text-sm">Recent credit usage across all services</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={usageTrendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.3} />
                <XAxis dataKey="period" stroke="#64748b" tick={{ fontSize: 12 }} />
                <YAxis stroke="#64748b" tick={{ fontSize: 12 }} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    color: 'hsl(var(--foreground))'
                  }}
                />
                <Legend />
                <Line type="monotone" dataKey="HeyGen" stroke={COLORS.heygen} strokeWidth={2.5} />
                <Line type="monotone" dataKey="Claude" stroke={COLORS.claude} strokeWidth={2.5} />
                <Line type="monotone" dataKey="ElevenLabs" stroke={COLORS.elevenlabs} strokeWidth={2.5} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Alert Information */}
        {heygenStats && heygenStats.status !== 'ok' && (
          <Card className="border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2 text-yellow-800 dark:text-yellow-300">
                <AlertCircle className="w-4 h-4" />
                Credit Alert
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-yellow-700 dark:text-yellow-400">
                HeyGen credits are running low. Current status: <strong className="font-semibold">{heygenStats.status}</strong>. 
                Only {heygenStats.remaining.toLocaleString()} credits remaining out of {heygenStats.limit.toLocaleString()}.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
