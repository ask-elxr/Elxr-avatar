import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, jsonb, index, boolean, integer, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// User roles enum
export const userRoleEnum = ["admin", "user"] as const;
export type UserRole = typeof userRoleEnum[number];

// User storage table for Replit Auth
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  role: varchar("role").default("user").notNull(), // 'admin' or 'user'
  memberstackId: varchar("memberstack_id"), // Memberstack member ID
  currentPlanSlug: varchar("current_plan_slug").default("free"), // Quick reference to current plan
  trialStartedAt: timestamp("trial_started_at"), // When free trial started
  lastActiveAt: timestamp("last_active_at"), // Last activity timestamp
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
  userId: varchar("user_id"), // No FK - allows temp_ IDs for anonymous users
  avatarId: varchar("avatar_id"), // Which avatar they're talking to
  role: varchar("role").notNull(), // 'user' or 'assistant'
  text: text("text").notNull(),
  embedding: jsonb("embedding"), // Store embeddings as JSON
  metadata: jsonb("metadata"), // Store additional metadata
  createdAt: timestamp("created_at").defaultNow(),
});

export const documents = pgTable("documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  filename: text("filename").notNull(),
  fileType: text("file_type").notNull(), // 'pdf' or 'video'
  fileSize: text("file_size"),
  status: text("status").default("processing"), // processing, completed, failed
  chunksCount: integer("chunks_count"),
  textLength: integer("text_length"),
  pineconeNamespace: text("pinecone_namespace"), // 'documents' or 'video-transcripts'
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

// Full course ingestion jobs - persistent across server restarts
export const ingestionJobs = pgTable("ingestion_jobs", {
  id: varchar("id").primaryKey(),
  status: varchar("status").notNull().default("detecting"), // detecting, processing, completed, failed
  kb: varchar("kb").notNull(),
  courseId: varchar("course_id").notNull(),
  courseTitle: varchar("course_title"),
  dryRun: boolean("dry_run").default(false),
  lessonsDetected: integer("lessons_detected").default(0),
  lessonsProcessed: integer("lessons_processed").default(0),
  totalArtifacts: integer("total_artifacts").default(0),
  currentLesson: varchar("current_lesson"),
  detectedLessons: jsonb("detected_lessons"), // Array of {lessonId, title, startIndex, endIndex}
  processedLessonIds: jsonb("processed_lesson_ids").default(sql`'[]'::jsonb`), // Array of completed lesson IDs
  errors: jsonb("errors").default(sql`'[]'::jsonb`), // Array of error messages
  result: jsonb("result"), // Final result data
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
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

export const updateUserSchema = createInsertSchema(users).pick({
  memberstackId: true,
  currentPlanSlug: true,
  trialStartedAt: true,
  lastActiveAt: true,
  role: true,
  updatedAt: true,
}).partial();

export const insertConversationSchema = createInsertSchema(conversations).pick({
  userId: true,
  avatarId: true,
  role: true,
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
export type UpdateUser = z.infer<typeof updateUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Conversation = typeof conversations.$inferSelect;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documents.$inferSelect;
export type InsertChatSession = z.infer<typeof insertChatSessionSchema>;
export type ChatSession = typeof chatSessions.$inferSelect;
export type InsertJob = z.infer<typeof insertJobSchema>;
export type Job = typeof jobs.$inferSelect;

// Streaming platform enum for interactive avatars
export const streamingPlatformEnum = ["liveavatar", "heygen"] as const;
export type StreamingPlatform = typeof streamingPlatformEnum[number];

// Interactive voice source enum (3 options for video streaming)
export const interactiveVoiceSourceEnum = ["elevenlabs", "heygen", "liveavatar"] as const;
export type InteractiveVoiceSource = typeof interactiveVoiceSourceEnum[number];

export const avatarProfiles = pgTable("avatar_profiles", {
  id: varchar("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  profileImageUrl: text("profile_image_url"),
  // Interactive streaming configuration
  streamingPlatform: text("streaming_platform").default("liveavatar").notNull(), // 'liveavatar' or 'heygen' for interactive streaming
  useHeygenVoiceForInteractive: boolean("use_heygen_voice_for_interactive").default(false).notNull(), // DEPRECATED: Use interactiveVoiceSource instead
  interactiveVoiceSource: text("interactive_voice_source").default("elevenlabs"), // 'elevenlabs', 'heygen', or 'liveavatar'
  heygenAvatarId: text("heygen_avatar_id"), // HeyGen Streaming Avatar ID (used when platform = heygen)
  liveAvatarId: text("live_avatar_id"), // LiveAvatar platform ID (used when platform = liveavatar)
  heygenVideoAvatarId: text("heygen_video_avatar_id"), // Separate ID for video generation (Instant Avatars)
  heygenVoiceId: text("heygen_voice_id"), // HeyGen voice ID for interactive mode (when interactiveVoiceSource = 'heygen')
  heygenVideoVoiceId: text("heygen_video_voice_id"), // Separate voice ID for video generation
  heygenKnowledgeId: text("heygen_knowledge_id"),
  elevenlabsVoiceId: text("elevenlabs_voice_id"), // ElevenLabs voice ID (used when interactiveVoiceSource = 'elevenlabs')
  liveAvatarVoiceId: text("live_avatar_voice_id"), // LiveAvatar voice ID (used when interactiveVoiceSource = 'liveavatar')
  liveAvatarContextId: text("live_avatar_context_id"), // LiveAvatar context ID (required for FULL mode)
  requiresFullMode: boolean("requires_full_mode").default(false).notNull(), // Some avatars only work with FULL mode (uses LiveAvatar's LLM instead of Claude)
  useHeygenVoiceForLive: boolean("use_heygen_voice_for_live").default(false).notNull(), // Toggle for video generation: false = ElevenLabs voice, true = HeyGen voice
  voiceRate: text("voice_rate").default("1.0"),
  audioOnlyVoiceId: text("audio_only_voice_id"), // Dedicated ElevenLabs voice ID for audio-only mode
  // Language configuration
  languageCode: text("language_code").default("en-US"), // BCP-47 language code for HeyGen & speech recognition (e.g., "en-US", "es-ES", "fr-FR")
  elevenLabsLanguageCode: text("elevenlabs_language_code").default("en"), // ElevenLabs language code (e.g., "en", "es", "fr", "de", "it", "pt", "pl", "hi", "ar", "zh", "ja", "ko")
  personalityPrompt: text("personality_prompt").notNull(),
  pineconeNamespaces: text("pinecone_namespaces").array().notNull().default(sql`ARRAY[]::text[]`),
  tags: text("tags").array().notNull().default(sql`ARRAY[]::text[]`),
  usePubMed: boolean("use_pubmed").default(false).notNull(),
  useWikipedia: boolean("use_wikipedia").default(false).notNull(),
  useGoogleSearch: boolean("use_google_search").default(false).notNull(),
  // Capability toggles - control what modes are available for each avatar
  enableAudioMode: boolean("enable_audio_mode").default(true).notNull(), // Enable/disable audio-only chat
  enableVideoMode: boolean("enable_video_mode").default(true).notNull(), // Enable/disable video streaming chat
  enableVideoCreation: boolean("enable_video_creation").default(true).notNull(), // Enable/disable video/course generation
  loadingAnimationUrl: text("loading_animation_url"), // Custom video/animation URL shown while avatar is loading (mp4/webm/gif)
  isActive: boolean("is_active").default(true).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
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

// Course creation system
export const courses = pgTable("courses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(), // Removed foreign key to support anonymous users
  title: text("title").notNull(),
  description: text("description"),
  avatarId: varchar("avatar_id").references(() => avatarProfiles.id).notNull(),
  status: varchar("status").notNull().default("draft"), // draft, generating, completed, failed
  thumbnailUrl: text("thumbnail_url"),
  totalLessons: integer("total_lessons").default(0),
  totalDuration: integer("total_duration").default(0), // Total duration in seconds
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const lessons = pgTable("lessons", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  courseId: varchar("course_id").references(() => courses.id, { onDelete: "cascade" }).notNull(),
  title: text("title").notNull(),
  script: text("script").notNull(), // The text the avatar will speak
  order: integer("order").notNull(), // Lesson order in the course
  duration: integer("duration"), // Estimated duration in seconds
  status: varchar("status").notNull().default("pending"), // pending, generating, completed, failed
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const generatedVideos = pgTable("generated_videos", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  lessonId: varchar("lesson_id").references(() => lessons.id, { onDelete: "cascade" }).notNull(),
  heygenVideoId: text("heygen_video_id"), // HeyGen's video generation ID
  videoUrl: text("video_url"), // URL to the generated video
  thumbnailUrl: text("thumbnail_url"),
  duration: integer("duration"), // Actual video duration in seconds
  status: varchar("status").notNull().default("queued"), // queued, generating, completed, failed
  testVideo: boolean("test_video").default(false), // Whether this is a watermarked test video
  errorMessage: text("error_message"),
  metadata: jsonb("metadata"), // Additional video metadata from HeyGen
  createdAt: timestamp("created_at").defaultNow().notNull(),
  generatedAt: timestamp("generated_at"),
});

export const insertCourseSchema = createInsertSchema(courses).pick({
  userId: true,
  title: true,
  description: true,
  avatarId: true,
  thumbnailUrl: true,
});

export const updateCourseSchema = createInsertSchema(courses).pick({
  title: true,
  description: true,
  avatarId: true,
  status: true,
  thumbnailUrl: true,
  totalLessons: true,
  totalDuration: true,
}).partial();

export const insertLessonSchema = createInsertSchema(lessons).pick({
  courseId: true,
  title: true,
  script: true,
  order: true,
  duration: true,
});

export const updateLessonSchema = createInsertSchema(lessons).pick({
  title: true,
  script: true,
  order: true,
  duration: true,
  status: true,
  errorMessage: true,
}).partial();

export const insertGeneratedVideoSchema = createInsertSchema(generatedVideos).pick({
  lessonId: true,
  heygenVideoId: true,
  videoUrl: true,
  thumbnailUrl: true,
  duration: true,
  status: true,
  metadata: true,
});

export const updateGeneratedVideoSchema = createInsertSchema(generatedVideos).pick({
  heygenVideoId: true,
  videoUrl: true,
  thumbnailUrl: true,
  duration: true,
  status: true,
  errorMessage: true,
  metadata: true,
  generatedAt: true,
}).partial();

export type InsertCourse = z.infer<typeof insertCourseSchema>;
export type UpdateCourse = z.infer<typeof updateCourseSchema>;
export type Course = typeof courses.$inferSelect;
export type InsertLesson = z.infer<typeof insertLessonSchema>;
export type UpdateLesson = z.infer<typeof updateLessonSchema>;
export type Lesson = typeof lessons.$inferSelect;
export type InsertGeneratedVideo = z.infer<typeof insertGeneratedVideoSchema>;
export type UpdateGeneratedVideo = z.infer<typeof updateGeneratedVideoSchema>;
export type GeneratedVideo = typeof generatedVideos.$inferSelect;

export const chatGeneratedVideos = pgTable("chat_generated_videos", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  avatarId: varchar("avatar_id").references(() => avatarProfiles.id).notNull(),
  requestText: text("request_text").notNull(),
  topic: text("topic").notNull(),
  script: text("script"),
  status: varchar("status").notNull().default("pending"),
  heygenVideoId: text("heygen_video_id"),
  videoUrl: text("video_url"),
  thumbnailUrl: text("thumbnail_url"),
  duration: integer("duration"),
  errorMessage: text("error_message"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export const insertChatGeneratedVideoSchema = createInsertSchema(chatGeneratedVideos).pick({
  userId: true,
  avatarId: true,
  requestText: true,
  topic: true,
});

export const updateChatGeneratedVideoSchema = createInsertSchema(chatGeneratedVideos).pick({
  script: true,
  status: true,
  heygenVideoId: true,
  videoUrl: true,
  thumbnailUrl: true,
  duration: true,
  errorMessage: true,
  metadata: true,
  updatedAt: true,
  completedAt: true,
}).partial();

export type InsertChatGeneratedVideo = z.infer<typeof insertChatGeneratedVideoSchema>;
export type UpdateChatGeneratedVideo = z.infer<typeof updateChatGeneratedVideoSchema>;
export type ChatGeneratedVideo = typeof chatGeneratedVideos.$inferSelect;

// Subscription plan types
export const planTypeEnum = ["free", "basic", "pro"] as const;
export type PlanType = typeof planTypeEnum[number];

export const subscriptionStatusEnum = ["active", "expired", "cancelled", "trial"] as const;
export type SubscriptionStatus = typeof subscriptionStatusEnum[number];

// Subscription plans table
export const subscriptionPlans = pgTable("subscription_plans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: varchar("slug").notNull().unique(), // 'free', 'basic', 'pro'
  name: varchar("name").notNull(), // Display name
  description: text("description"),
  priceMonthly: integer("price_monthly").notNull().default(0), // Price in cents
  durationHours: integer("duration_hours"), // For free trial (1 hour)
  avatarLimit: integer("avatar_limit"), // 1 for free/basic, null for unlimited (pro)
  videoLimit: integer("video_limit"), // Monthly video limit (null = unlimited)
  courseLimit: integer("course_limit"), // Monthly course limit (null = unlimited)
  courseLessonLimit: integer("course_lesson_limit"), // Max lessons per course
  chatSessionLimit: integer("chat_session_limit"), // Monthly HeyGen chat sessions (null = unlimited)
  memberstackPlanId: varchar("memberstack_plan_id"), // Memberstack plan ID for paid plans
  features: jsonb("features"), // Additional features as JSON
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// User subscriptions table
export const userSubscriptions = pgTable("user_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  planId: varchar("plan_id").references(() => subscriptionPlans.id).notNull(),
  memberstackSubscriptionId: varchar("memberstack_subscription_id"), // Memberstack subscription ID
  status: varchar("status").notNull().default("active"), // active, expired, cancelled, trial
  selectedAvatarId: varchar("selected_avatar_id").references(() => avatarProfiles.id), // For plans with 1 avatar limit
  startedAt: timestamp("started_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at"), // When subscription/trial expires
  renewsAt: timestamp("renews_at"), // Next billing date for recurring
  cancelledAt: timestamp("cancelled_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Usage tracking per billing period
export const usagePeriods = pgTable("usage_periods", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  subscriptionId: varchar("subscription_id").references(() => userSubscriptions.id),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  videosCreated: integer("videos_created").default(0).notNull(),
  coursesCreated: integer("courses_created").default(0).notNull(),
  chatSessionsUsed: integer("chat_sessions_used").default(0).notNull(),
  moodEntriesLogged: integer("mood_entries_logged").default(0).notNull(),
  creditsUsed: integer("credits_used").default(0).notNull(), // Total HeyGen credits
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertSubscriptionPlanSchema = createInsertSchema(subscriptionPlans).omit({
  id: true,
  createdAt: true,
});

export const insertUserSubscriptionSchema = createInsertSchema(userSubscriptions).pick({
  userId: true,
  planId: true,
  memberstackSubscriptionId: true,
  status: true,
  selectedAvatarId: true,
  expiresAt: true,
  renewsAt: true,
});

export const updateUserSubscriptionSchema = createInsertSchema(userSubscriptions).pick({
  planId: true,
  status: true,
  selectedAvatarId: true,
  expiresAt: true,
  renewsAt: true,
  cancelledAt: true,
  updatedAt: true,
}).partial();

export const insertUsagePeriodSchema = createInsertSchema(usagePeriods).pick({
  userId: true,
  subscriptionId: true,
  periodStart: true,
  periodEnd: true,
});

export const updateUsagePeriodSchema = createInsertSchema(usagePeriods).pick({
  videosCreated: true,
  coursesCreated: true,
  chatSessionsUsed: true,
  moodEntriesLogged: true,
  creditsUsed: true,
  updatedAt: true,
}).partial();

export type InsertSubscriptionPlan = z.infer<typeof insertSubscriptionPlanSchema>;
export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;
export type InsertUserSubscription = z.infer<typeof insertUserSubscriptionSchema>;
export type UpdateUserSubscription = z.infer<typeof updateUserSubscriptionSchema>;
export type UserSubscription = typeof userSubscriptions.$inferSelect;
export type InsertUsagePeriod = z.infer<typeof insertUsagePeriodSchema>;
export type UpdateUsagePeriod = z.infer<typeof updateUsagePeriodSchema>;
export type UsagePeriod = typeof usagePeriods.$inferSelect;

// Mood tracking for emotional wellness
export const moodTypeEnum = ["joyful", "calm", "energized", "anxious", "sad", "stressed", "neutral"] as const;
export type MoodType = typeof moodTypeEnum[number];

export const moodEntries = pgTable("mood_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  avatarId: varchar("avatar_id").references(() => avatarProfiles.id),
  mood: varchar("mood").notNull(), // One of moodTypeEnum values
  intensity: integer("intensity").default(3), // 1-5 scale
  notes: text("notes"), // Optional user notes about their mood
  avatarResponse: text("avatar_response"), // AI-generated empathetic response
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertMoodEntrySchema = createInsertSchema(moodEntries).pick({
  userId: true,
  avatarId: true,
  mood: true,
  intensity: true,
  notes: true,
}).extend({
  mood: z.enum(moodTypeEnum),
  intensity: z.number().min(1).max(5).optional(),
  notes: z.string().max(500).optional(),
});

export const updateMoodEntrySchema = createInsertSchema(moodEntries).pick({
  avatarResponse: true,
}).partial();

export type InsertMoodEntry = z.infer<typeof insertMoodEntrySchema>;
export type UpdateMoodEntry = z.infer<typeof updateMoodEntrySchema>;
export type MoodEntry = typeof moodEntries.$inferSelect;

// Podcast batch ingestion for processing zip archives
export const podcastBatchStatusEnum = ["pending", "extracting", "processing", "completed", "failed"] as const;
export type PodcastBatchStatus = typeof podcastBatchStatusEnum[number];

export const podcastEpisodeStatusEnum = ["pending", "processing", "completed", "failed", "skipped"] as const;
export type PodcastEpisodeStatus = typeof podcastEpisodeStatusEnum[number];

export const podcastBatches = pgTable("podcast_batches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  namespace: varchar("namespace").notNull(),
  zipFilename: varchar("zip_filename").notNull(),
  status: varchar("status").notNull().default("pending"),
  autoDetect: boolean("auto_detect").default(false),
  distillMode: varchar("distill_mode").default("chunks"), // 'chunks' or 'mentor_memory'
  mentorName: varchar("mentor_name"),
  totalEpisodes: integer("total_episodes").default(0),
  processedEpisodes: integer("processed_episodes").default(0),
  successfulEpisodes: integer("successful_episodes").default(0),
  failedEpisodes: integer("failed_episodes").default(0),
  skippedEpisodes: integer("skipped_episodes").default(0),
  totalChunks: integer("total_chunks").default(0),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const podcastEpisodes = pgTable("podcast_episodes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  batchId: varchar("batch_id").references(() => podcastBatches.id).notNull(),
  filename: varchar("filename").notNull(),
  contentHash: varchar("content_hash"), // SHA-256 hash of transcript text for duplicate detection
  status: varchar("status").notNull().default("pending"),
  chunksCount: integer("chunks_count").default(0),
  discardedCount: integer("discarded_count").default(0),
  textLength: integer("text_length").default(0),
  transcriptText: text("transcript_text"),
  chunksJson: jsonb("chunks_json"), // Pre-processed chunks as JSON for resumable uploads
  chunksUploaded: integer("chunks_uploaded").default(0), // Track how many chunks uploaded (for single-namespace)
  namespaceProgress: jsonb("namespace_progress"), // Per-namespace upload progress: { "NAMESPACE_NAME": chunks_uploaded }
  predictedNamespaces: text("predicted_namespaces").array(),
  primaryNamespace: varchar("primary_namespace"),
  confidence: real("confidence"),
  classificationRationale: text("classification_rationale"),
  manualOverride: boolean("manual_override").default(false),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPodcastBatchSchema = createInsertSchema(podcastBatches).pick({
  namespace: true,
  zipFilename: true,
  autoDetect: true,
  distillMode: true,
  mentorName: true,
}).extend({
  namespace: z.string().min(1, "Namespace is required"),
  zipFilename: z.string().min(1, "Filename is required"),
  autoDetect: z.boolean().optional().default(false),
  distillMode: z.enum(['chunks', 'mentor_memory']).optional().default('chunks'),
  mentorName: z.string().optional(),
});

export type InsertPodcastBatch = z.infer<typeof insertPodcastBatchSchema>;
export type PodcastBatch = typeof podcastBatches.$inferSelect;
export type PodcastEpisode = typeof podcastEpisodes.$inferSelect;
