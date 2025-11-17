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
import { Badge } from "@/components/ui/badge";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { Activity, Users, Clock, TrendingUp } from "lucide-react";

interface SessionStats {
  current: {
    totalActiveSessions: number;
    sessionsByUser: Record<string, number>;
    sessionsByAvatar: Record<string, number>;
  };
  history: {
    sessionId: string;
    userId: string;
    avatarId: string;
    startTime: number;
    endTime: number;
    duration: number;
  }[];
}

export function SessionStats() {
  const { data: stats, isLoading } = useQuery<SessionStats>({
    queryKey: ["/api/admin/sessions"],
    refetchInterval: 5000,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Session Management</CardTitle>
          <CardDescription>Monitor active sessions and usage patterns</CardDescription>
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

  if (!stats) {
    return (
      <Card className="bg-gradient-to-br from-background via-background to-indigo-500/5 border-indigo-500/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <div className="p-1.5 bg-gradient-to-br from-indigo-500 to-violet-500 rounded-md">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <span className="bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-500 bg-clip-text text-transparent">
              Session Management
            </span>
          </CardTitle>
          <CardDescription>Monitor active sessions and usage patterns</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              No session data available. Sessions will appear here once users interact with avatars.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { current, history } = stats;

  const avatarStats = Object.entries(current.sessionsByAvatar).map(([avatarId, count]) => ({
    avatarId,
    activeCount: count,
  }));

  const historicalAvatarStats = history.reduce((acc, session) => {
    if (!acc[session.avatarId]) {
      acc[session.avatarId] = {
        count: 0,
        totalDuration: 0,
      };
    }
    acc[session.avatarId].count++;
    acc[session.avatarId].totalDuration += session.duration;
    return acc;
  }, {} as Record<string, { count: number; totalDuration: number }>);

  const historicalChartData = Object.entries(historicalAvatarStats).map(([avatarId, data]) => ({
    name: avatarId.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' '),
    sessions: data.count,
    avgDuration: Math.round(data.totalDuration / data.count / 1000),
  }));

  const getAvatarColor = (avatarId: string): string => {
    const colors: Record<string, string> = {
      'mark-kohl': "hsl(271, 81%, 56%)",
      'mark': "hsl(271, 81%, 56%)",
      'willie-gault': "hsl(142, 76%, 36%)",
      'willie': "hsl(142, 76%, 36%)",
      'june': "hsl(217, 91%, 60%)",
      'ann': "hsl(24, 95%, 53%)",
      'shawn': "hsl(171, 77%, 64%)",
      'thad': "hsl(45, 93%, 47%)",
    };
    return colors[avatarId] || "hsl(240, 5%, 64%)";
  };

  const getAvatarDisplayName = (avatarId: string): string => {
    const displayNames: Record<string, string> = {
      'mark-kohl': 'Mark Kohl',
      'mark': 'Mark Kohl',
      'willie-gault': 'Willie Gault',
      'willie': 'Willie Gault',
      'june': 'June',
      'ann': 'Ann',
      'shawn': 'Shawn',
      'thad': 'Thad',
    };
    return displayNames[avatarId] || avatarId.split('-').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  const totalHistoricalSessions = history.length;
  const totalDuration = history.reduce((sum, session) => sum + session.duration, 0);
  const avgSessionDuration = totalHistoricalSessions > 0 
    ? Math.round(totalDuration / totalHistoricalSessions / 1000) 
    : 0;

  const pieChartData = Object.entries(historicalAvatarStats).map(([avatarId, data]) => ({
    name: getAvatarDisplayName(avatarId),
    value: data.count,
    percentage: ((data.count / totalHistoricalSessions) * 100).toFixed(1),
    color: getAvatarColor(avatarId),
  }));

  return (
    <Card className="bg-gradient-to-br from-background via-background to-indigo-500/5 border-indigo-500/20 shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-2xl">
          <div className="p-1.5 bg-gradient-to-br from-indigo-500 to-violet-500 rounded-md">
            <Activity className="w-5 h-5 text-white" />
          </div>
          <span className="bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-500 bg-clip-text text-transparent">
            Session Management & Credit Monitoring
          </span>
        </CardTitle>
        <CardDescription>
          Real-time session tracking, rate limiting, and HeyGen credit usage monitoring
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Current Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Active Sessions Card */}
            <div className="relative group">
              <div className="absolute -inset-[1px] bg-gradient-to-r from-indigo-500 via-violet-500 to-indigo-500 rounded-lg opacity-60 blur-sm group-hover:opacity-100 transition-opacity animate-gradient-xy" />
              <Card className="relative glass border-indigo-500/30 shadow-xl shadow-indigo-500/10 group-hover:shadow-2xl group-hover:shadow-indigo-500/20 transition-all duration-300">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="p-2 bg-gradient-to-br from-indigo-500 to-violet-500 rounded-md shadow-lg shadow-indigo-500/30 animate-pulse-slow">
                      <Activity className="w-4 h-4 text-white" />
                    </div>
                    <span className="text-sm font-medium bg-gradient-to-r from-indigo-400 via-violet-400 to-indigo-400 bg-clip-text text-transparent animate-gradient-text">Active Sessions</span>
                  </div>
                  <p className="text-3xl font-bold bg-gradient-to-r from-indigo-500 to-violet-500 bg-clip-text text-transparent" data-testid="stat-active-sessions">
                    {current.totalActiveSessions}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Max 2 per user enforced
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Total Sessions Card */}
            <div className="relative group">
              <div className="absolute -inset-[1px] bg-gradient-to-r from-violet-500 via-purple-500 to-violet-500 rounded-lg opacity-60 blur-sm group-hover:opacity-100 transition-opacity animate-gradient-xy" />
              <Card className="relative glass border-violet-500/30 shadow-xl shadow-violet-500/10 group-hover:shadow-2xl group-hover:shadow-violet-500/20 transition-all duration-300">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="p-2 bg-gradient-to-br from-violet-500 to-purple-500 rounded-md shadow-lg shadow-violet-500/30 animate-pulse-slow">
                      <Users className="w-4 h-4 text-white" />
                    </div>
                    <span className="text-sm font-medium bg-gradient-to-r from-violet-400 via-purple-400 to-violet-400 bg-clip-text text-transparent animate-gradient-text">Total Sessions</span>
                  </div>
                  <p className="text-3xl font-bold bg-gradient-to-r from-violet-500 to-purple-500 bg-clip-text text-transparent" data-testid="stat-total-sessions">
                    {totalHistoricalSessions}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Last 1000 tracked
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Average Duration Card */}
            <div className="relative group">
              <div className="absolute -inset-[1px] bg-gradient-to-r from-purple-500 via-pink-500 to-purple-500 rounded-lg opacity-60 blur-sm group-hover:opacity-100 transition-opacity animate-gradient-xy" />
              <Card className="relative glass border-purple-500/30 shadow-xl shadow-purple-500/10 group-hover:shadow-2xl group-hover:shadow-purple-500/20 transition-all duration-300">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="p-2 bg-gradient-to-br from-purple-500 to-pink-500 rounded-md shadow-lg shadow-purple-500/30 animate-pulse-slow">
                      <Clock className="w-4 h-4 text-white" />
                    </div>
                    <span className="text-sm font-medium bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400 bg-clip-text text-transparent animate-gradient-text">Avg Duration</span>
                  </div>
                  <p className="text-3xl font-bold bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent" data-testid="stat-avg-duration">
                    {avgSessionDuration}s
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    90s timeout configured
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Charts Section */}
          {totalHistoricalSessions > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Pie Chart - Session Distribution */}
              <div className="relative group">
                <div className="absolute -inset-[1px] bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 rounded-lg opacity-60 blur-sm group-hover:opacity-100 transition-opacity animate-gradient-xy" />
                <Card className="relative glass border-indigo-500/30 shadow-xl shadow-indigo-500/10 group-hover:shadow-2xl group-hover:shadow-indigo-500/20 transition-all duration-300">
                  <CardContent className="p-4">
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                      <div className="p-1.5 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-md shadow-lg shadow-indigo-500/30">
                        <TrendingUp className="w-4 h-4 text-white" />
                      </div>
                      <span className="bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 bg-clip-text text-transparent animate-gradient-text">
                        Session Distribution
                      </span>
                    </h3>
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={pieChartData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ percentage }) => `${percentage}%`}
                          outerRadius={100}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {pieChartData.map((entry, index) => (
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
                  </CardContent>
                </Card>
              </div>

              {/* Bar Chart - Average Duration */}
              <div className="relative group">
                <div className="absolute -inset-[1px] bg-gradient-to-r from-violet-500 via-pink-500 to-violet-500 rounded-lg opacity-60 blur-sm group-hover:opacity-100 transition-opacity animate-gradient-xy" />
                <Card className="relative glass border-violet-500/30 shadow-xl shadow-violet-500/10 group-hover:shadow-2xl group-hover:shadow-violet-500/20 transition-all duration-300">
                  <CardContent className="p-4">
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                      <div className="p-1.5 bg-gradient-to-br from-violet-500 to-pink-500 rounded-md shadow-lg shadow-violet-500/30">
                        <Clock className="w-4 h-4 text-white" />
                      </div>
                      <span className="bg-gradient-to-r from-violet-500 via-pink-500 to-violet-500 bg-clip-text text-transparent animate-gradient-text">
                        Average Duration
                      </span>
                    </h3>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={historicalChartData}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                        <XAxis 
                          dataKey="name" 
                          tick={{ fontSize: 12 }}
                          angle={-45}
                          textAnchor="end"
                          height={80}
                        />
                        <YAxis tick={{ fontSize: 12 }} />
                        <Tooltip 
                          contentStyle={{
                            background: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px'
                          }}
                        />
                        <Bar dataKey="avgDuration" fill="hsl(271, 81%, 56%)" radius={[8, 8, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* Active Sessions Table */}
          {current.totalActiveSessions > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <Activity className="w-5 h-5 text-indigo-500" />
                Active Sessions Right Now
              </h3>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Avatar</TableHead>
                      <TableHead className="text-right">Active Count</TableHead>
                      <TableHead className="text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {avatarStats.map((stat) => (
                      <TableRow key={stat.avatarId} data-testid={`active-session-${stat.avatarId}`}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-3 h-3 rounded-full animate-pulse"
                              style={{ background: getAvatarColor(stat.avatarId) }}
                            />
                            {getAvatarDisplayName(stat.avatarId)}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-semibold" data-testid={`count-${stat.avatarId}`}>
                          {stat.activeCount}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="outline" className="border-green-500/50 text-green-500">
                            Live
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* Historical Stats Table */}
          {totalHistoricalSessions > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <Users className="w-5 h-5 text-violet-500" />
                Historical Usage by Avatar
              </h3>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Avatar</TableHead>
                      <TableHead className="text-right">Total Sessions</TableHead>
                      <TableHead className="text-right">%</TableHead>
                      <TableHead className="text-right">Avg Duration</TableHead>
                      <TableHead className="text-right">Total Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(historicalAvatarStats).map(([avatarId, data]) => {
                      const percentage = ((data.count / totalHistoricalSessions) * 100).toFixed(1);
                      const avgDuration = Math.round(data.totalDuration / data.count / 1000);
                      const totalMinutes = Math.round(data.totalDuration / 60000);
                      
                      return (
                        <TableRow key={avatarId} data-testid={`history-row-${avatarId}`}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <div 
                                className="w-3 h-3 rounded-full"
                                style={{ background: getAvatarColor(avatarId) }}
                              />
                              {getAvatarDisplayName(avatarId)}
                            </div>
                          </TableCell>
                          <TableCell className="text-right" data-testid={`sessions-${avatarId}`}>
                            {data.count.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right font-semibold text-indigo-500" data-testid={`percentage-${avatarId}`}>
                            {percentage}%
                          </TableCell>
                          <TableCell className="text-right" data-testid={`avg-duration-${avatarId}`}>
                            {avgDuration}s
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground" data-testid={`total-time-${avatarId}`}>
                            {totalMinutes}m
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* Credit Savings Summary */}
          <div className="relative group">
            <div className="absolute -inset-[1px] bg-gradient-to-r from-green-500 via-emerald-500 to-green-500 rounded-lg opacity-60 blur-sm group-hover:opacity-100 transition-opacity animate-gradient-xy" />
            <Card className="relative glass border-green-500/30 shadow-xl shadow-green-500/10 group-hover:shadow-2xl group-hover:shadow-green-500/20 transition-all duration-300">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-gradient-to-br from-green-500 to-emerald-500 rounded-md shadow-lg shadow-green-500/30 animate-pulse-slow">
                    <TrendingUp className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold mb-2 bg-gradient-to-r from-green-400 via-emerald-400 to-green-400 bg-clip-text text-transparent animate-gradient-text">
                      Credit-Saving Features Active
                    </h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>✓ Audio-only mode as default (massive HeyGen credit savings)</li>
                      <li>✓ 90-second inactivity timeout (silent end, ~300 chars saved)</li>
                      <li>✓ No automatic greetings or farewells (reduces AI token usage)</li>
                      <li>✓ 2-session concurrent limit per user</li>
                      <li>✓ 30-second avatar switch cooldown</li>
                      <li>✓ Session cleanup on all exit paths (tab close, timeout, disconnect)</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
