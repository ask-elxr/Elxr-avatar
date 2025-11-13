import {
  users,
  documents,
  avatarProfiles,
  apiCalls,
  knowledgeBaseSources,
  type User,
  type UpsertUser,
  type Document,
  type AvatarProfile,
  type InsertAvatarProfile,
  type UpdateAvatarProfile,
  type InsertApiCall,
  type KnowledgeBaseSource,
  type InsertKnowledgeBaseSource,
  type UpdateKnowledgeBaseSource,
} from "@shared/schema";
import { db } from "./db";
import { eq, gte, sql as drizzleSql, and } from "drizzle-orm";

// Interface for storage operations
export interface IStorage {
  // User operations for Replit Auth
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  getAllUsers(): Promise<User[]>;
  
  // Document operations
  getAllDocuments(): Promise<Document[]>;
  getDocument(id: string): Promise<Document | undefined>;
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

  // Knowledge base source operations
  listKnowledgeSources(userId: string): Promise<KnowledgeBaseSource[]>;
  getKnowledgeSource(id: string, userId: string): Promise<KnowledgeBaseSource | undefined>;
  createKnowledgeSource(data: InsertKnowledgeBaseSource): Promise<KnowledgeBaseSource>;
  updateKnowledgeSource(id: string, userId: string, data: UpdateKnowledgeBaseSource): Promise<KnowledgeBaseSource | undefined>;
  deleteKnowledgeSource(id: string, userId: string): Promise<void>;
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

  // Document operations
  async getAllDocuments(): Promise<Document[]> {
    const allDocuments = await db.select().from(documents);
    return allDocuments;
  }

  async getDocument(id: string): Promise<Document | undefined> {
    const [document] = await db.select().from(documents).where(eq(documents.id, id));
    return document;
  }

  async deleteDocument(id: string): Promise<void> {
    await db.delete(documents).where(eq(documents.id, id));
  }

  // Avatar operations
  async listAvatars(activeOnly: boolean = true): Promise<AvatarProfile[]> {
    if (activeOnly) {
      return await db.select().from(avatarProfiles).where(eq(avatarProfiles.isActive, true));
    }
    return await db.select().from(avatarProfiles);
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
}

export const storage = new DatabaseStorage();
