import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, jsonb, index, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// User storage table for Replit Auth
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Session storage table for authentication (required by express-session)
export const authSessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

export const conversations = pgTable("conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  text: text("text").notNull(),
  embedding: jsonb("embedding"), // Store embeddings as JSON
  metadata: jsonb("metadata"), // Store additional metadata
  createdAt: timestamp("created_at").defaultNow(),
});

export const documents = pgTable("documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  filename: text("filename").notNull(),
  fileType: text("file_type").notNull(),
  fileSize: text("file_size"),
  status: text("status").default("processing"), // processing, completed, failed
  chunksCount: text("chunks_count"),
  objectPath: text("object_path"), // Path to file in object storage
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Renamed from sessions to avoid conflict with auth sessions
export const chatSessions = pgTable("chat_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  conversationHistory: jsonb("conversation_history"), // Store conversation messages
  context: text("context"), // RAG context from documents
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Background job tracking table
export const jobs = pgTable("jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  documentId: varchar("document_id").references(() => documents.id),
  userId: varchar("user_id").references(() => users.id),
  type: varchar("type").notNull(), // 'document-upload', 'url-processing'
  status: varchar("status").notNull().default("pending"), // pending, processing, completed, failed
  progress: text("progress").default("0"), // 0-1 as string for compatibility
  error: jsonb("error"), // Error message and stack trace
  result: jsonb("result"), // Job result data
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Schema for Replit Auth user operations
export const upsertUserSchema = createInsertSchema(users).pick({
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  profileImageUrl: true,
});

export const insertConversationSchema = createInsertSchema(conversations).pick({
  userId: true,
  text: true,
  embedding: true,
  metadata: true,
});

export const insertDocumentSchema = createInsertSchema(documents).pick({
  userId: true,
  filename: true,
  fileType: true,
  fileSize: true,
  objectPath: true,
});

export const insertChatSessionSchema = createInsertSchema(chatSessions).pick({
  userId: true,
  conversationHistory: true,
  context: true,
});

export const insertJobSchema = createInsertSchema(jobs).pick({
  documentId: true,
  userId: true,
  type: true,
  status: true,
  progress: true,
  error: true,
  result: true,
});

export type UpsertUser = z.infer<typeof upsertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Conversation = typeof conversations.$inferSelect;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documents.$inferSelect;
export type InsertChatSession = z.infer<typeof insertChatSessionSchema>;
export type ChatSession = typeof chatSessions.$inferSelect;
export type InsertJob = z.infer<typeof insertJobSchema>;
export type Job = typeof jobs.$inferSelect;

export const avatarProfiles = pgTable("avatar_profiles", {
  id: varchar("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  heygenAvatarId: text("heygen_avatar_id"),
  heygenVoiceId: text("heygen_voice_id"),
  heygenKnowledgeId: text("heygen_knowledge_id"),
  elevenlabsVoiceId: text("elevenlabs_voice_id"),
  voiceRate: text("voice_rate").default("1.0"),
  personalityPrompt: text("personality_prompt").notNull(),
  pineconeNamespaces: text("pinecone_namespaces").array().notNull().default(sql`ARRAY[]::text[]`),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAvatarProfileSchema = createInsertSchema(avatarProfiles).omit({
  createdAt: true,
});

export const updateAvatarProfileSchema = createInsertSchema(avatarProfiles).omit({
  id: true,
  createdAt: true,
}).partial();

export type InsertAvatarProfile = z.infer<typeof insertAvatarProfileSchema>;
export type UpdateAvatarProfile = z.infer<typeof updateAvatarProfileSchema>;
export type AvatarProfile = typeof avatarProfiles.$inferSelect;

export const apiCalls = pgTable("api_calls", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serviceName: varchar("service_name").notNull(),
  endpoint: text("endpoint").notNull(),
  userId: varchar("user_id").references(() => users.id),
  responseTimeMs: integer("response_time_ms").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export const insertApiCallSchema = createInsertSchema(apiCalls).pick({
  serviceName: true,
  endpoint: true,
  userId: true,
  responseTimeMs: true,
});

export type InsertApiCall = z.infer<typeof insertApiCallSchema>;
export type ApiCall = typeof apiCalls.$inferSelect;

// HeyGen credit usage tracking
export const heygenCreditUsage = pgTable("heygen_credit_usage", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  operation: varchar("operation").notNull(), // 'token_generation', 'streaming_session', etc.
  creditsUsed: integer("credits_used").notNull().default(1), // Estimated credits used
  successful: boolean("successful").notNull().default(true),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export const insertHeygenCreditUsageSchema = createInsertSchema(heygenCreditUsage).pick({
  userId: true,
  operation: true,
  creditsUsed: true,
  successful: true,
});

export type InsertHeygenCreditUsage = z.infer<typeof insertHeygenCreditUsageSchema>;
export type HeygenCreditUsage = typeof heygenCreditUsage.$inferSelect;

// Personal knowledge base connections
export const knowledgeBaseSources = pgTable("knowledge_base_sources", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  type: varchar("type").notNull(), // 'notion', 'obsidian', 'manual'
  name: text("name").notNull(), // User-friendly name
  pineconeNamespace: varchar("pinecone_namespace").notNull().unique(), // Isolated namespace for this source
  config: jsonb("config"), // Source-specific configuration (e.g., Notion database ID, Obsidian vault path)
  status: varchar("status").notNull().default("active"), // active, syncing, error, disabled
  lastSyncAt: timestamp("last_sync_at"),
  syncError: text("sync_error"),
  itemsCount: integer("items_count").default(0), // Number of items synced
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertKnowledgeBaseSourceSchema = createInsertSchema(knowledgeBaseSources).pick({
  userId: true,
  type: true,
  name: true,
  pineconeNamespace: true,
  config: true,
});

export const updateKnowledgeBaseSourceSchema = createInsertSchema(knowledgeBaseSources).pick({
  name: true,
  config: true,
  status: true,
  lastSyncAt: true,
  syncError: true,
  itemsCount: true,
}).partial();

export type InsertKnowledgeBaseSource = z.infer<typeof insertKnowledgeBaseSourceSchema>;
export type UpdateKnowledgeBaseSource = z.infer<typeof updateKnowledgeBaseSourceSchema>;
export type KnowledgeBaseSource = typeof knowledgeBaseSources.$inferSelect;
