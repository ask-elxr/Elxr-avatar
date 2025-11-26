import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { Users, MessageSquare, TrendingUp, Activity, BarChart3 } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LineChart, Line, PieChart, Pie, Cell } from "recharts";
import { MarqueeText } from "@/components/MarqueeText";

interface AvatarStats {
  avatarId: string;
  avatarName: string;
  totalMessages: number;
  uniqueUsers: number;
  firstInteraction: string;
  lastInteraction: string;
}

interface TopicStats {
  topic: string;
  count: number;
  percentage: number;
}

interface AnalyticsData {
  avatarStats: AvatarStats[];
  totalConversations: number;
  totalUsers: number;
  avgMessagesPerUser: number;
  topUserMessages: TopicStats[];
  engagementTrend: { date: string; messages: number }[];
}

export default function Analytics() {
  const { data: analytics, isLoading } = useQuery<AnalyticsData>({
    queryKey: ['/api/analytics/overview'],
    refetchInterval: 60000, // Refresh every minute
  });

  if (isLoading || !analytics) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const COLORS = ['#0ea5e9', '#8b5cf6', '#14b8a6', '#64748b', '#06b6d4', '#6366f1'];

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-semibold mb-2 text-foreground">Analytics Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Analyze user trends, avatar interactions, and conversation patterns
          </p>
        </div>

        {/* Overview Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-muted-foreground" />
                Total Conversations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{analytics.totalConversations.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-1">All-time messages</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Users className="w-4 h-4 text-muted-foreground" />
                Unique Users
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{analytics.totalUsers.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-1">Active users</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-muted-foreground" />
                Avg Messages/User
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{analytics.avgMessagesPerUser.toFixed(1)}</p>
              <p className="text-xs text-muted-foreground mt-1">Engagement level</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Activity className="w-4 h-4 text-muted-foreground" />
                Active Avatars
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{analytics.avatarStats.length}</p>
              <p className="text-xs text-muted-foreground mt-1">Total avatars</p>
            </CardContent>
          </Card>
        </div>

        {/* Avatar Popularity */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                Avatar Interaction Rankings
              </CardTitle>
              <CardDescription className="text-sm">
                Most popular avatars by total messages
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={analytics.avatarStats} margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.3} />
                  <XAxis dataKey="avatarName" stroke="#64748b" tick={{ fontSize: 12 }} />
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
                  <Bar dataKey="totalMessages" fill="#0ea5e9" name="Total Messages" />
                  <Bar dataKey="uniqueUsers" fill="#8b5cf6" name="Unique Users" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Avatar Distribution</CardTitle>
              <CardDescription className="text-sm">
                Message distribution by avatar
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={analytics.avatarStats}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ avatarName, percent }) => `${avatarName} (${(percent * 100).toFixed(0)}%)`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="totalMessages"
                  >
                    {analytics.avatarStats.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      color: 'hsl(var(--foreground))'
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Detailed Avatar Stats Table */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Avatar Performance Details</CardTitle>
            <CardDescription className="text-sm">
              Comprehensive view of each avatar's engagement metrics
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Avatar</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">Messages</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">Users</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">Msg/User</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">First Used</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Last Used</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.avatarStats.map((avatar, index) => (
                    <tr key={avatar.avatarId} className="border-b border-border/50 hover:bg-accent/50">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div 
                            className="w-8 h-8 rounded-full flex items-center justify-center text-white font-semibold text-xs"
                            style={{ backgroundColor: COLORS[index % COLORS.length] }}
                          >
                            {avatar.avatarName.charAt(0)}
                          </div>
                          <span className="font-medium">{avatar.avatarName}</span>
                        </div>
                      </td>
                      <td className="text-right py-3 px-4 font-semibold">{avatar.totalMessages.toLocaleString()}</td>
                      <td className="text-right py-3 px-4">{avatar.uniqueUsers}</td>
                      <td className="text-right py-3 px-4">{(avatar.totalMessages / avatar.uniqueUsers).toFixed(1)}</td>
                      <td className="py-3 px-4 text-muted-foreground">
                        {new Date(avatar.firstInteraction).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">
                        {new Date(avatar.lastInteraction).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Common User Messages */}
        {analytics.topUserMessages && analytics.topUserMessages.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Common User Topics</CardTitle>
              <CardDescription className="text-sm">
                Most frequently discussed topics and questions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 overflow-hidden">
                {analytics.topUserMessages.map((topic, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0 overflow-hidden">
                      <div className="flex justify-between items-center mb-1 gap-2">
                        <MarqueeText text={topic.topic} className="text-sm font-medium" maxWidth="70%" />
                        <span className="text-xs text-muted-foreground flex-shrink-0">
                          {topic.percentage.toFixed(1)}%
                        </span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div
                          className="h-2 rounded-full bg-primary transition-all duration-300"
                          style={{ width: `${Math.min(topic.percentage * 10, 100)}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-muted-foreground flex-shrink-0 min-w-[2.5rem] text-right">
                      {topic.count}x
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Engagement Trend */}
        {analytics.engagementTrend && analytics.engagementTrend.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Engagement Trend</CardTitle>
              <CardDescription className="text-sm">
                Message activity over time
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={analytics.engagementTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.3} />
                  <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 12 }} />
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
                  <Line type="monotone" dataKey="messages" stroke="#0ea5e9" strokeWidth={2.5} name="Messages" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
