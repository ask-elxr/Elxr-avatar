import {
  users,
  documents,
  avatarProfiles,
  type User,
  type UpsertUser,
  type Document,
  type AvatarProfile,
  type InsertAvatarProfile,
  type UpdateAvatarProfile,
} from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";

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
      return await db.select().from(avatarProfiles).where(eq(avatarProfiles.isActive, "true"));
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
      .set({ isActive: "false" })
      .where(eq(avatarProfiles.id, id));
  }
}

export const storage = new DatabaseStorage();
