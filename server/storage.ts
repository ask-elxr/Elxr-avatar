import {
  users,
  documents,
  avatarProfiles,
  apiCalls,
  heygenCreditUsage,
  knowledgeBaseSources,
  conversations,
  podcastBatches,
  podcastEpisodes,
  type User,
  type UpsertUser,
  type Document,
  type AvatarProfile,
  type InsertAvatarProfile,
  type UpdateAvatarProfile,
  type InsertApiCall,
  type InsertHeygenCreditUsage,
  type HeygenCreditUsage,
  type KnowledgeBaseSource,
  type InsertKnowledgeBaseSource,
  type UpdateKnowledgeBaseSource,
  type Conversation,
  type InsertConversation,
  type PodcastBatch,
  type InsertPodcastBatch,
  type PodcastEpisode,
} from "@shared/schema";
import { db } from "./db";
import { eq, gte, sql as drizzleSql, and, desc } from "drizzle-orm";

// Interface for storage operations
export interface IStorage {
  // User operations for Replit Auth
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  getAllUsers(): Promise<User[]>;
  updateUserRole(id: string, role: 'admin' | 'user'): Promise<User | undefined>;
  updateUserProfile(id: string, data: { firstName?: string; lastName?: string }): Promise<User | undefined>;
  
  // Document operations
  getAllDocuments(): Promise<Document[]>;
  getDocument(id: string): Promise<Document | undefined>;
  getUserDocuments(userId: string): Promise<Document[]>;
  getDocumentStats(): Promise<{
    total: number;
    byStatus: { status: string; count: number }[];
    byType: { type: string; count: number }[];
    totalChunks: number;
  }>;
  createDocument(data: {
    userId: string;
    filename: string;
    fileType: string;
    fileSize?: string;
    chunksCount?: number;
    textLength?: number;
    pineconeNamespace?: string;
    objectPath?: string;
  }): Promise<Document>;
  updateDocumentStatus(id: string, status: string, chunksCount?: number, textLength?: number): Promise<void>;
  deleteDocument(id: string): Promise<void>;
  
  // Avatar operations
  listAvatars(activeOnly?: boolean): Promise<AvatarProfile[]>;
  getAvatar(id: string): Promise<AvatarProfile | undefined>;
  createAvatar(data: InsertAvatarProfile): Promise<AvatarProfile>;
  updateAvatar(id: string, data: UpdateAvatarProfile): Promise<AvatarProfile | undefined>;
  softDeleteAvatar(id: string): Promise<void>;

  // API call tracking operations
  logApiCall(data: InsertApiCall): Promise<void>;
  getCostStats(): Promise<{
    services: {
      serviceName: string;
      total: number;
      last24h: number;
      last7d: number;
      avgResponseTimeMs: number;
    }[];
  }>;

  // HeyGen credit tracking operations
  logHeygenCredit(data: InsertHeygenCreditUsage): Promise<void>;
  getHeygenCreditUsage(userId?: string, startDate?: Date): Promise<{
    totalCredits: number;
    recentUsage: HeygenCreditUsage[];
  }>;
  getHeygenCreditBalance(): Promise<{
    totalUsed: number;
    last24h: number;
    last7d: number;
  }>;

  // Knowledge base source operations
  listKnowledgeSources(userId: string): Promise<KnowledgeBaseSource[]>;
  getKnowledgeSource(id: string, userId: string): Promise<KnowledgeBaseSource | undefined>;
  createKnowledgeSource(data: InsertKnowledgeBaseSource): Promise<KnowledgeBaseSource>;
  updateKnowledgeSource(id: string, userId: string, data: UpdateKnowledgeBaseSource): Promise<KnowledgeBaseSource | undefined>;
  deleteKnowledgeSource(id: string, userId: string): Promise<void>;
  
  // Conversation history operations
  saveConversation(data: InsertConversation): Promise<Conversation>;
  getConversationHistory(userId: string, avatarId?: string, limit?: number): Promise<Conversation[]>;
  
  // Analytics operations
  getAvatarInteractionStats(): Promise<any[]>;
  getConversationMetrics(): Promise<{
    totalConversations: number;
    totalUsers: number;
    avgMessagesPerUser: number;
  }>;
  getTopUserMessages(limit: number): Promise<{ topic: string; count: number; percentage: number }[]>;
  getEngagementTrend(days: number): Promise<{ date: string; messages: number }[]>;
  
  // Podcast batch ingestion operations
  createPodcastBatch(data: InsertPodcastBatch): Promise<PodcastBatch>;
  getPodcastBatch(id: string): Promise<PodcastBatch | undefined>;
  updatePodcastBatch(id: string, data: Partial<PodcastBatch>): Promise<PodcastBatch | undefined>;
  listPodcastBatches(limit?: number): Promise<PodcastBatch[]>;
  createPodcastEpisode(data: { batchId: string; filename: string; textLength?: number; transcriptText?: string; contentHash?: string }): Promise<PodcastEpisode>;
  getPodcastEpisodesByBatch(batchId: string): Promise<PodcastEpisode[]>;
  updatePodcastEpisode(id: string, data: Partial<PodcastEpisode>): Promise<PodcastEpisode | undefined>;
  findPodcastEpisodeByHash(contentHash: string): Promise<PodcastEpisode | undefined>;
  deletePodcastBatch(id: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // User operations for Replit Auth

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    const allUsers = await db.select().from(users);
    return allUsers;
  }

  async updateUserRole(id: string, role: 'admin' | 'user'): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ role, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async updateUserProfile(id: string, data: { firstName?: string; lastName?: string }): Promise<User | undefined> {
    // Build update object with only provided (non-undefined) fields
    const updateData: Record<string, any> = { updatedAt: new Date() };
    if (data.firstName !== undefined) {
      updateData.firstName = data.firstName;
    }
    if (data.lastName !== undefined) {
      updateData.lastName = data.lastName;
    }

    const [user] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  // Document operations
  async getAllDocuments(): Promise<Document[]> {
    const allDocuments = await db.select().from(documents);
    return allDocuments;
  }

  async getDocument(id: string): Promise<Document | undefined> {
    const [document] = await db.select().from(documents).where(eq(documents.id, id));
    return document;
  }

  async getDocumentStats(): Promise<{
    total: number;
    byStatus: { status: string; count: number }[];
    byType: { type: string; count: number }[];
    totalChunks: number;
  }> {
    const allDocs = await db.select().from(documents);
    
    const total = allDocs.length;
    
    const byStatus = allDocs.reduce((acc, doc) => {
      const status = doc.status || 'unknown';
      const existing = acc.find(s => s.status === status);
      if (existing) {
        existing.count++;
      } else {
        acc.push({ status, count: 1 });
      }
      return acc;
    }, [] as { status: string; count: number }[]);
    
    const byType = allDocs.reduce((acc, doc) => {
      const type = doc.fileType || 'unknown';
      const existing = acc.find(t => t.type === type);
      if (existing) {
        existing.count++;
      } else {
        acc.push({ type, count: 1 });
      }
      return acc;
    }, [] as { type: string; count: number }[]);
    
    const totalChunks = allDocs.reduce((sum, doc) => sum + (doc.chunksCount || 0), 0);
    
    return {
      total,
      byStatus,
      byType,
      totalChunks,
    };
  }

  async getUserDocuments(userId: string): Promise<Document[]> {
    const userDocs = await db
      .select()
      .from(documents)
      .where(eq(documents.userId, userId))
      .orderBy(desc(documents.createdAt));
    return userDocs;
  }

  async createDocument(data: {
    userId: string;
    filename: string;
    fileType: string;
    fileSize?: string;
    chunksCount?: number;
    textLength?: number;
    pineconeNamespace?: string;
    objectPath?: string;
  }): Promise<Document> {
    const [document] = await db.insert(documents).values(data).returning();
    return document;
  }

  async updateDocumentStatus(
    id: string,
    status: string,
    chunksCount?: number,
    textLength?: number
  ): Promise<void> {
    await db
      .update(documents)
      .set({ 
        status, 
        chunksCount,
        textLength,
        updatedAt: new Date() 
      })
      .where(eq(documents.id, id));
  }

  async deleteDocument(id: string): Promise<void> {
    await db.delete(documents).where(eq(documents.id, id));
  }

  // Avatar operations
  async listAvatars(activeOnly: boolean = true): Promise<AvatarProfile[]> {
    if (activeOnly) {
      return await db.select().from(avatarProfiles)
        .where(eq(avatarProfiles.isActive, true))
        .orderBy(avatarProfiles.sortOrder);
    }
    return await db.select().from(avatarProfiles).orderBy(avatarProfiles.sortOrder);
  }

  async getAvatar(id: string): Promise<AvatarProfile | undefined> {
    const [avatar] = await db.select().from(avatarProfiles).where(eq(avatarProfiles.id, id));
    return avatar;
  }

  async createAvatar(data: InsertAvatarProfile): Promise<AvatarProfile> {
    const [avatar] = await db.insert(avatarProfiles).values(data).returning();
    return avatar;
  }

  async updateAvatar(id: string, data: UpdateAvatarProfile): Promise<AvatarProfile | undefined> {
    const [avatar] = await db
      .update(avatarProfiles)
      .set(data)
      .where(eq(avatarProfiles.id, id))
      .returning();
    return avatar;
  }

  async softDeleteAvatar(id: string): Promise<void> {
    await db
      .update(avatarProfiles)
      .set({ isActive: false })
      .where(eq(avatarProfiles.id, id));
  }

  // API call tracking operations
  async logApiCall(data: InsertApiCall): Promise<void> {
    await db.insert(apiCalls).values(data);
  }

  async getCostStats(): Promise<{
    services: {
      serviceName: string;
      total: number;
      last24h: number;
      last7d: number;
      avgResponseTimeMs: number;
    }[];
  }> {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Get all calls grouped by service
    const allCalls = await db
      .select({
        serviceName: apiCalls.serviceName,
        total: drizzleSql<number>`count(*)::int`,
        avgResponseTimeMs: drizzleSql<number>`avg(${apiCalls.responseTimeMs})::int`,
      })
      .from(apiCalls)
      .groupBy(apiCalls.serviceName);

    // Get last 24h calls
    const last24hCalls = await db
      .select({
        serviceName: apiCalls.serviceName,
        count: drizzleSql<number>`count(*)::int`,
      })
      .from(apiCalls)
      .where(gte(apiCalls.timestamp, last24h))
      .groupBy(apiCalls.serviceName);

    // Get last 7d calls
    const last7dCalls = await db
      .select({
        serviceName: apiCalls.serviceName,
        count: drizzleSql<number>`count(*)::int`,
      })
      .from(apiCalls)
      .where(gte(apiCalls.timestamp, last7d))
      .groupBy(apiCalls.serviceName);

    // Merge all services from any time window
    const serviceMap = new Map<string, {
      serviceName: string;
      total: number;
      last24h: number;
      last7d: number;
      avgResponseTimeMs: number;
    }>();

    // Add all-time data
    for (const service of allCalls) {
      serviceMap.set(service.serviceName, {
        serviceName: service.serviceName,
        total: service.total,
        last24h: 0,
        last7d: 0,
        avgResponseTimeMs: service.avgResponseTimeMs,
      });
    }

    // Add/update with last 24h data
    for (const service of last24hCalls) {
      const existing = serviceMap.get(service.serviceName);
      if (existing) {
        existing.last24h = service.count;
      } else {
        // Service not in allCalls - use 24h count as best available total
        serviceMap.set(service.serviceName, {
          serviceName: service.serviceName,
          total: service.count, // Use 24h count as total for new services
          last24h: service.count,
          last7d: 0,
          avgResponseTimeMs: 0,
        });
      }
    }

    // Add/update with last 7d data
    for (const service of last7dCalls) {
      const existing = serviceMap.get(service.serviceName);
      if (existing) {
        existing.last7d = service.count;
        // If service wasn't in allCalls, use 7d count as total (more accurate than 24h)
        if (existing.total === existing.last24h) {
          existing.total = Math.max(existing.total, service.count);
        }
      } else {
        // Service only appears in 7d window
        serviceMap.set(service.serviceName, {
          serviceName: service.serviceName,
          total: service.count,
          last24h: 0,
          last7d: service.count,
          avgResponseTimeMs: 0,
        });
      }
    }

    return { services: Array.from(serviceMap.values()) };
  }

  // HeyGen credit tracking operations
  async logHeygenCredit(data: InsertHeygenCreditUsage): Promise<void> {
    await db.insert(heygenCreditUsage).values(data);
  }

  async getHeygenCreditUsage(userId?: string, startDate?: Date): Promise<{
    totalCredits: number;
    recentUsage: HeygenCreditUsage[];
  }> {
    const conditions = [];
    
    if (userId) {
      conditions.push(eq(heygenCreditUsage.userId, userId));
    }
    
    if (startDate) {
      conditions.push(gte(heygenCreditUsage.timestamp, startDate));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    
    const usage = await db
      .select()
      .from(heygenCreditUsage)
      .where(whereClause)
      .orderBy(desc(heygenCreditUsage.timestamp))
      .limit(50);

    const totalCreditsResult = await db
      .select({
        total: drizzleSql<number>`COALESCE(SUM(${heygenCreditUsage.creditsUsed}), 0)::int`,
      })
      .from(heygenCreditUsage)
      .where(whereClause);

    return {
      totalCredits: totalCreditsResult[0]?.total || 0,
      recentUsage: usage,
    };
  }

  async getHeygenCreditBalance(): Promise<{
    totalUsed: number;
    last24h: number;
    last7d: number;
  }> {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [totalResult] = await db
      .select({
        total: drizzleSql<number>`COALESCE(SUM(${heygenCreditUsage.creditsUsed}), 0)::int`,
      })
      .from(heygenCreditUsage);

    const [last24hResult] = await db
      .select({
        total: drizzleSql<number>`COALESCE(SUM(${heygenCreditUsage.creditsUsed}), 0)::int`,
      })
      .from(heygenCreditUsage)
      .where(gte(heygenCreditUsage.timestamp, last24h));

    const [last7dResult] = await db
      .select({
        total: drizzleSql<number>`COALESCE(SUM(${heygenCreditUsage.creditsUsed}), 0)::int`,
      })
      .from(heygenCreditUsage)
      .where(gte(heygenCreditUsage.timestamp, last7d));

    return {
      totalUsed: totalResult?.total || 0,
      last24h: last24hResult?.total || 0,
      last7d: last7dResult?.total || 0,
    };
  }

  // Knowledge base source operations
  async listKnowledgeSources(userId: string): Promise<KnowledgeBaseSource[]> {
    const sources = await db
      .select()
      .from(knowledgeBaseSources)
      .where(eq(knowledgeBaseSources.userId, userId));
    return sources;
  }

  async getKnowledgeSource(id: string, userId: string): Promise<KnowledgeBaseSource | undefined> {
    const [source] = await db
      .select()
      .from(knowledgeBaseSources)
      .where(and(
        eq(knowledgeBaseSources.id, id),
        eq(knowledgeBaseSources.userId, userId)
      ));
    return source;
  }

  async createKnowledgeSource(data: InsertKnowledgeBaseSource): Promise<KnowledgeBaseSource> {
    const [source] = await db
      .insert(knowledgeBaseSources)
      .values(data)
      .returning();
    return source;
  }

  async updateKnowledgeSource(
    id: string,
    userId: string,
    data: UpdateKnowledgeBaseSource
  ): Promise<KnowledgeBaseSource | undefined> {
    const [source] = await db
      .update(knowledgeBaseSources)
      .set({ ...data, updatedAt: new Date() })
      .where(and(
        eq(knowledgeBaseSources.id, id),
        eq(knowledgeBaseSources.userId, userId)
      ))
      .returning();
    return source;
  }

  async deleteKnowledgeSource(id: string, userId: string): Promise<void> {
    await db
      .delete(knowledgeBaseSources)
      .where(and(
        eq(knowledgeBaseSources.id, id),
        eq(knowledgeBaseSources.userId, userId)
      ));
  }

  // Conversation history operations
  async saveConversation(data: InsertConversation): Promise<Conversation> {
    const [conversation] = await db
      .insert(conversations)
      .values(data)
      .returning();
    return conversation;
  }

  async getConversationHistory(userId: string, avatarId?: string, limit: number = 20): Promise<Conversation[]> {
    const query = db
      .select()
      .from(conversations)
      .where(
        avatarId 
          ? and(eq(conversations.userId, userId), eq(conversations.avatarId, avatarId))
          : eq(conversations.userId, userId)
      )
      .orderBy(desc(conversations.createdAt))
      .limit(limit);
    
    const history = await query;
    // Return in chronological order (oldest first) for Claude context
    return history.reverse();
  }

  // Analytics operations
  async getAvatarInteractionStats(): Promise<any[]> {
    const result = await db.execute(drizzleSql`
      SELECT 
        avatar_id,
        COUNT(*) as total_messages,
        COUNT(DISTINCT user_id) as unique_users,
        MIN(created_at) as first_interaction,
        MAX(created_at) as last_interaction
      FROM conversations
      WHERE avatar_id IS NOT NULL
      GROUP BY avatar_id
      ORDER BY total_messages DESC
    `);
    return result.rows;
  }

  async getConversationMetrics(): Promise<{
    totalConversations: number;
    totalUsers: number;
    avgMessagesPerUser: number;
  }> {
    const result = await db.execute(drizzleSql`
      SELECT 
        COUNT(*) as total_conversations,
        COUNT(DISTINCT user_id) as total_users
      FROM conversations
    `);
    
    const row: any = result.rows[0];
    const totalConversations = parseInt(row.total_conversations) || 0;
    const totalUsers = parseInt(row.total_users) || 1;
    
    return {
      totalConversations,
      totalUsers,
      avgMessagesPerUser: totalConversations / totalUsers,
    };
  }

  async getTopUserMessages(limit: number): Promise<{ topic: string; count: number; percentage: number }[]> {
    const result = await db.execute(drizzleSql`
      SELECT 
        text as topic,
        COUNT(*) as count
      FROM conversations
      WHERE role = 'user' AND created_at >= NOW() - INTERVAL '30 days'
      GROUP BY text
      ORDER BY count DESC
      LIMIT ${limit}
    `);
    
    const totalResult = await db.execute(drizzleSql`
      SELECT COUNT(*) as total
      FROM conversations
      WHERE role = 'user' AND created_at >= NOW() - INTERVAL '30 days'
    `);
    
    const total = parseInt((totalResult.rows[0] as any).total) || 1;
    
    return result.rows.map((row: any) => ({
      topic: row.topic,
      count: parseInt(row.count),
      percentage: (parseInt(row.count) / total) * 100,
    }));
  }

  async getEngagementTrend(days: number): Promise<{ date: string; messages: number }[]> {
    const result = await db.execute(drizzleSql`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as messages
      FROM conversations
      WHERE created_at >= NOW() - INTERVAL '${drizzleSql.raw(days.toString())} days'
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `);
    
    return result.rows.map((row: any) => ({
      date: new Date(row.date).toLocaleDateString(),
      messages: parseInt(row.messages),
    }));
  }

  // Podcast batch ingestion operations
  async createPodcastBatch(data: InsertPodcastBatch): Promise<PodcastBatch> {
    const [batch] = await db
      .insert(podcastBatches)
      .values(data)
      .returning();
    return batch;
  }

  async getPodcastBatch(id: string): Promise<PodcastBatch | undefined> {
    const [batch] = await db.select().from(podcastBatches).where(eq(podcastBatches.id, id));
    return batch;
  }

  async updatePodcastBatch(id: string, data: Partial<PodcastBatch>): Promise<PodcastBatch | undefined> {
    const [batch] = await db
      .update(podcastBatches)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(podcastBatches.id, id))
      .returning();
    return batch;
  }

  async listPodcastBatches(limit: number = 20): Promise<PodcastBatch[]> {
    const batches = await db
      .select()
      .from(podcastBatches)
      .orderBy(desc(podcastBatches.createdAt))
      .limit(limit);
    return batches;
  }

  async createPodcastEpisode(data: { batchId: string; filename: string; textLength?: number; transcriptText?: string; contentHash?: string }): Promise<PodcastEpisode> {
    const [episode] = await db
      .insert(podcastEpisodes)
      .values(data)
      .returning();
    return episode;
  }

  async getPodcastEpisodesByBatch(batchId: string): Promise<PodcastEpisode[]> {
    const episodes = await db
      .select()
      .from(podcastEpisodes)
      .where(eq(podcastEpisodes.batchId, batchId))
      .orderBy(podcastEpisodes.filename);
    return episodes;
  }

  async updatePodcastEpisode(id: string, data: Partial<PodcastEpisode>): Promise<PodcastEpisode | undefined> {
    const [episode] = await db
      .update(podcastEpisodes)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(podcastEpisodes.id, id))
      .returning();
    return episode;
  }

  async deletePodcastBatch(id: string): Promise<void> {
    await db.delete(podcastEpisodes).where(eq(podcastEpisodes.batchId, id));
    await db.delete(podcastBatches).where(eq(podcastBatches.id, id));
  }

  async findPodcastEpisodeByHash(contentHash: string): Promise<PodcastEpisode | undefined> {
    const [episode] = await db
      .select()
      .from(podcastEpisodes)
      .where(eq(podcastEpisodes.contentHash, contentHash))
      .limit(1);
    return episode;
  }
}

export const storage = new DatabaseStorage();
