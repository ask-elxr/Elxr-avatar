import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { Users, MessageSquare, TrendingUp, Activity, BarChart3, Heart, Smile } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LineChart, Line, PieChart, Pie, Cell } from "recharts";
import { MarqueeText } from "@/components/MarqueeText";

interface MoodDistribution {
  mood: string;
  count: number;
}

interface MoodAnalyticsData {
  distribution: MoodDistribution[];
  trend: { date: string; mood: string; count: number }[];
  intensityByMood: { mood: string; avgIntensity: number }[];
  totals: { totalEntries: number; uniqueUsers: number };
  positiveRatio: number;
}

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

const MOOD_COLORS: Record<string, string> = {
  joyful: '#facc15',
  calm: '#3b82f6',
  energized: '#a855f7',
  neutral: '#6b7280',
  anxious: '#f59e0b',
  sad: '#6366f1',
  stressed: '#ef4444',
};

const MOOD_EMOJIS: Record<string, string> = {
  joyful: '😊',
  calm: '😌',
  energized: '⚡',
  neutral: '😐',
  anxious: '😰',
  sad: '😢',
  stressed: '😫',
};

export default function Analytics() {
  const { data: analytics, isLoading } = useQuery<AnalyticsData>({
    queryKey: ['/api/analytics/overview'],
    refetchInterval: 60000,
  });

  const { data: moodAnalytics } = useQuery<MoodAnalyticsData>({
    queryKey: ['/api/admin/mood/analytics'],
    refetchInterval: 60000,
  });

  if (isLoading || !analytics) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const COLORS = [
    '#0ea5e9', // Sky blue
    '#8b5cf6', // Purple
    '#14b8a6', // Teal
    '#f97316', // Orange
    '#ec4899', // Pink
    '#22c55e', // Green
    '#eab308', // Yellow
    '#ef4444', // Red
    '#06b6d4', // Cyan
    '#6366f1', // Indigo
    '#a855f7', // Violet
    '#f43f5e', // Rose
  ];

  const moodDistributionData = moodAnalytics?.distribution?.map(m => ({
    name: m.mood,
    value: m.count,
    emoji: MOOD_EMOJIS[m.mood] || '🙂',
    color: MOOD_COLORS[m.mood] || '#6b7280',
  })) || [];

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="mb-4 sm:mb-6">
          <h1 className="text-2xl sm:text-3xl font-semibold mb-2 text-foreground">Analytics Dashboard</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Analyze user trends, avatar interactions, and conversation patterns
          </p>
        </div>

        {/* Overview Cards */}
        <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6 pt-3 sm:pt-6">
              <CardTitle className="text-xs sm:text-sm font-medium flex items-center gap-1.5 sm:gap-2">
                <MessageSquare className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground flex-shrink-0" />
                <span className="truncate">Conversations</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
              <p className="text-xl sm:text-2xl font-semibold">{analytics.totalConversations.toLocaleString()}</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">All-time messages</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6 pt-3 sm:pt-6">
              <CardTitle className="text-xs sm:text-sm font-medium flex items-center gap-1.5 sm:gap-2">
                <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground flex-shrink-0" />
                <span className="truncate">Unique Users</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
              <p className="text-xl sm:text-2xl font-semibold">{analytics.totalUsers.toLocaleString()}</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">Active users</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6 pt-3 sm:pt-6">
              <CardTitle className="text-xs sm:text-sm font-medium flex items-center gap-1.5 sm:gap-2">
                <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground flex-shrink-0" />
                <span className="truncate">Avg Msgs/User</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
              <p className="text-xl sm:text-2xl font-semibold">{analytics.avgMessagesPerUser.toFixed(1)}</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">Engagement level</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6 pt-3 sm:pt-6">
              <CardTitle className="text-xs sm:text-sm font-medium flex items-center gap-1.5 sm:gap-2">
                <Activity className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground flex-shrink-0" />
                <span className="truncate">Active Avatars</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
              <p className="text-xl sm:text-2xl font-semibold">{analytics.avatarStats.length}</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">Total avatars</p>
            </CardContent>
          </Card>
        </div>

        {/* Avatar Popularity */}
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-3 px-3 sm:px-6">
              <CardTitle className="text-sm sm:text-base lg:text-lg font-semibold flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                Avatar Interaction Rankings
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Most popular avatars by total messages
              </CardDescription>
            </CardHeader>
            <CardContent className="px-2 sm:px-6">
              <div className="h-[280px] sm:h-[320px] lg:h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.avatarStats} margin={{ left: 0, right: 10, top: 5, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.3} />
                    <XAxis 
                      dataKey="avatarName" 
                      stroke="#64748b" 
                      tick={{ fontSize: 10 }} 
                      angle={-45}
                      textAnchor="end"
                      interval={0}
                      height={60}
                    />
                    <YAxis stroke="#64748b" tick={{ fontSize: 10 }} width={35} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        color: 'hsl(var(--foreground))',
                        fontSize: '12px'
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                    <Bar dataKey="totalMessages" fill="#0ea5e9" name="Messages" />
                    <Bar dataKey="uniqueUsers" fill="#8b5cf6" name="Users" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3 px-3 sm:px-6">
              <CardTitle className="text-sm sm:text-base lg:text-lg font-semibold">Avatar Distribution</CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Message distribution by avatar
              </CardDescription>
            </CardHeader>
            <CardContent className="px-2 sm:px-6">
              <div className="h-[280px] sm:h-[320px] lg:h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={analytics.avatarStats}
                      cx="50%"
                      cy="42%"
                      labelLine={false}
                      outerRadius={120}
                      innerRadius={50}
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
                        color: 'hsl(var(--foreground))',
                        fontSize: '14px'
                      }}
                      formatter={(value: number, name: string, props: any) => [
                        `${value} messages (${((props.payload.totalMessages / analytics.avatarStats.reduce((sum, s) => sum + s.totalMessages, 0)) * 100).toFixed(0)}%)`,
                        props.payload.avatarName
                      ]}
                    />
                    <Legend 
                      layout="horizontal" 
                      verticalAlign="bottom" 
                      align="center"
                      wrapperStyle={{ fontSize: '13px', paddingTop: '10px' }}
                      formatter={(value, entry: any) => entry.payload?.avatarName || value}
                      iconSize={12}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Detailed Avatar Stats Table */}
        <Card>
          <CardHeader className="pb-3 px-3 sm:px-6">
            <CardTitle className="text-sm sm:text-base font-semibold">Avatar Performance Details</CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              Comprehensive view of each avatar's engagement metrics
            </CardDescription>
          </CardHeader>
          <CardContent className="px-2 sm:px-6">
            <div className="overflow-x-auto -mx-2 sm:mx-0">
              <table className="w-full text-xs sm:text-sm min-w-[500px]">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 sm:py-3 px-2 sm:px-4 font-medium text-muted-foreground">Avatar</th>
                    <th className="text-right py-2 sm:py-3 px-2 sm:px-4 font-medium text-muted-foreground">Msgs</th>
                    <th className="text-right py-2 sm:py-3 px-2 sm:px-4 font-medium text-muted-foreground">Users</th>
                    <th className="text-right py-2 sm:py-3 px-2 sm:px-4 font-medium text-muted-foreground hidden sm:table-cell">Msg/User</th>
                    <th className="text-left py-2 sm:py-3 px-2 sm:px-4 font-medium text-muted-foreground hidden md:table-cell">First Used</th>
                    <th className="text-left py-2 sm:py-3 px-2 sm:px-4 font-medium text-muted-foreground hidden md:table-cell">Last Used</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.avatarStats.map((avatar, index) => (
                    <tr key={avatar.avatarId} className="border-b border-border/50 hover:bg-accent/50">
                      <td className="py-2 sm:py-3 px-2 sm:px-4">
                        <div className="flex items-center gap-2 sm:gap-3">
                          <div 
                            className="w-7 h-7 sm:w-8 sm:h-8 flex-shrink-0 aspect-square rounded-full flex items-center justify-center text-white font-semibold text-xs"
                            style={{ backgroundColor: COLORS[index % COLORS.length] }}
                          >
                            {avatar.avatarName.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-medium text-xs sm:text-sm truncate max-w-[80px] sm:max-w-none">{avatar.avatarName}</span>
                        </div>
                      </td>
                      <td className="text-right py-2 sm:py-3 px-2 sm:px-4 font-semibold">{avatar.totalMessages.toLocaleString()}</td>
                      <td className="text-right py-2 sm:py-3 px-2 sm:px-4">{avatar.uniqueUsers}</td>
                      <td className="text-right py-2 sm:py-3 px-2 sm:px-4 hidden sm:table-cell">{(avatar.totalMessages / avatar.uniqueUsers).toFixed(1)}</td>
                      <td className="py-2 sm:py-3 px-2 sm:px-4 text-muted-foreground hidden md:table-cell">
                        {new Date(avatar.firstInteraction).toLocaleDateString()}
                      </td>
                      <td className="py-2 sm:py-3 px-2 sm:px-4 text-muted-foreground hidden md:table-cell">
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
            <CardHeader className="pb-3 px-3 sm:px-6">
              <CardTitle className="text-sm sm:text-base font-semibold">Common User Topics</CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Most frequently discussed topics and questions
              </CardDescription>
            </CardHeader>
            <CardContent className="px-3 sm:px-6">
              <div className="space-y-2 sm:space-y-3 overflow-hidden">
                {analytics.topUserMessages.map((topic, index) => (
                  <div key={index} className="flex items-center gap-2 sm:gap-3">
                    <div className="flex-1 min-w-0 overflow-hidden">
                      <div className="flex justify-between items-center mb-1 gap-2">
                        <MarqueeText text={topic.topic} className="text-xs sm:text-sm font-medium" maxWidth="65%" />
                        <span className="text-[10px] sm:text-xs text-muted-foreground flex-shrink-0">
                          {topic.percentage.toFixed(1)}%
                        </span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-1.5 sm:h-2">
                        <div
                          className="h-1.5 sm:h-2 rounded-full bg-primary transition-all duration-300"
                          style={{ width: `${Math.min(topic.percentage * 10, 100)}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-xs sm:text-sm font-semibold text-muted-foreground flex-shrink-0 min-w-[2rem] sm:min-w-[2.5rem] text-right">
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
            <CardHeader className="pb-3 px-3 sm:px-6">
              <CardTitle className="text-sm sm:text-base font-semibold">Engagement Trend</CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Message activity over time
              </CardDescription>
            </CardHeader>
            <CardContent className="px-2 sm:px-6">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={analytics.engagementTrend} margin={{ left: 0, right: 10, top: 5, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.3} />
                  <XAxis 
                    dataKey="date" 
                    stroke="#64748b" 
                    tick={{ fontSize: 9 }}
                    angle={-45}
                    textAnchor="end"
                    height={45}
                    interval={0}
                  />
                  <YAxis stroke="#64748b" tick={{ fontSize: 10 }} width={30} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      color: 'hsl(var(--foreground))',
                      fontSize: '12px'
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                  <Line type="monotone" dataKey="messages" stroke="#0ea5e9" strokeWidth={2} name="Messages" dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Mood Analytics Section */}
        {moodAnalytics && (
          <>
            {/* Mood Overview Cards */}
            <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6 pt-3 sm:pt-6">
                  <CardTitle className="text-xs sm:text-sm font-medium flex items-center gap-1.5 sm:gap-2">
                    <Heart className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-pink-500 flex-shrink-0" />
                    <span className="truncate">Mood Entries</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
                  <p className="text-xl sm:text-2xl font-semibold">{moodAnalytics.totals.totalEntries.toLocaleString()}</p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">Total logged</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6 pt-3 sm:pt-6">
                  <CardTitle className="text-xs sm:text-sm font-medium flex items-center gap-1.5 sm:gap-2">
                    <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground flex-shrink-0" />
                    <span className="truncate">Users Tracking</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
                  <p className="text-xl sm:text-2xl font-semibold">{moodAnalytics.totals.uniqueUsers.toLocaleString()}</p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">Active trackers</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6 pt-3 sm:pt-6">
                  <CardTitle className="text-xs sm:text-sm font-medium flex items-center gap-1.5 sm:gap-2">
                    <Smile className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-500 flex-shrink-0" />
                    <span className="truncate">Positive Mood</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
                  <p className="text-xl sm:text-2xl font-semibold">{moodAnalytics.positiveRatio}%</p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">Of all entries</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6 pt-3 sm:pt-6">
                  <CardTitle className="text-xs sm:text-sm font-medium flex items-center gap-1.5 sm:gap-2">
                    <Activity className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground flex-shrink-0" />
                    <span className="truncate">Avg Intensity</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
                  <p className="text-xl sm:text-2xl font-semibold">
                    {moodAnalytics.intensityByMood.length > 0 
                      ? (moodAnalytics.intensityByMood.reduce((sum, m) => sum + (m.avgIntensity || 0), 0) / moodAnalytics.intensityByMood.length).toFixed(1)
                      : '—'
                    }/5
                  </p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">Across all moods</p>
                </CardContent>
              </Card>
            </div>

            {/* Mood Distribution Chart */}
            <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
              <Card>
                <CardHeader className="pb-3 px-3 sm:px-6">
                  <CardTitle className="text-sm sm:text-base lg:text-lg font-semibold flex items-center gap-2">
                    <Heart className="w-4 h-4 text-pink-500" />
                    Mood Distribution
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm">
                    Breakdown of all mood entries by type
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-2 sm:px-6">
                  {moodDistributionData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={280}>
                      <PieChart>
                        <Pie
                          data={moodDistributionData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={100}
                          paddingAngle={2}
                          dataKey="value"
                          label={({ name, percent }) => `${MOOD_EMOJIS[name] || '🙂'} ${(percent * 100).toFixed(0)}%`}
                          labelLine={{ stroke: '#94a3b8', strokeWidth: 1 }}
                        >
                          {moodDistributionData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px',
                            color: 'hsl(var(--foreground))',
                            fontSize: '12px'
                          }}
                          formatter={(value: number, name: string) => [
                            `${value} entries`, 
                            `${MOOD_EMOJIS[name] || ''} ${name.charAt(0).toUpperCase() + name.slice(1)}`
                          ]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-[280px] text-muted-foreground">
                      No mood data available
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Mood Intensity by Type */}
              <Card>
                <CardHeader className="pb-3 px-3 sm:px-6">
                  <CardTitle className="text-sm sm:text-base lg:text-lg font-semibold flex items-center gap-2">
                    <BarChart3 className="w-4 h-4" />
                    Mood Intensity
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm">
                    Average intensity level per mood type
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-2 sm:px-6">
                  {moodAnalytics.intensityByMood.length > 0 ? (
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart 
                        data={moodAnalytics.intensityByMood.map(m => ({
                          mood: `${MOOD_EMOJIS[m.mood] || ''} ${m.mood.charAt(0).toUpperCase() + m.mood.slice(1)}`,
                          intensity: m.avgIntensity,
                          fill: MOOD_COLORS[m.mood] || '#6b7280',
                        }))}
                        margin={{ left: 0, right: 10, top: 10, bottom: 60 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.3} />
                        <XAxis 
                          dataKey="mood" 
                          stroke="#64748b" 
                          tick={{ fontSize: 10 }}
                          angle={-45}
                          textAnchor="end"
                          height={60}
                          interval={0}
                        />
                        <YAxis 
                          stroke="#64748b" 
                          tick={{ fontSize: 10 }} 
                          width={30}
                          domain={[0, 5]}
                          ticks={[1, 2, 3, 4, 5]}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px',
                            color: 'hsl(var(--foreground))',
                            fontSize: '12px'
                          }}
                          formatter={(value: number) => [`${value}/5`, 'Avg Intensity']}
                        />
                        <Bar 
                          dataKey="intensity" 
                          radius={[4, 4, 0, 0]}
                        >
                          {moodAnalytics.intensityByMood.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={MOOD_COLORS[entry.mood] || '#6b7280'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-[280px] text-muted-foreground">
                      No intensity data available
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
