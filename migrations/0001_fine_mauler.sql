CREATE TABLE "chat_generated_videos" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"avatar_id" varchar NOT NULL,
	"request_text" text NOT NULL,
	"topic" text NOT NULL,
	"script" text,
	"status" varchar DEFAULT 'pending' NOT NULL,
	"heygen_video_id" text,
	"video_url" text,
	"thumbnail_url" text,
	"duration" integer,
	"error_message" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"avatar_id" varchar NOT NULL,
	"status" varchar DEFAULT 'draft' NOT NULL,
	"thumbnail_url" text,
	"total_lessons" integer DEFAULT 0,
	"total_duration" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generated_videos" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_id" varchar NOT NULL,
	"heygen_video_id" text,
	"video_url" text,
	"thumbnail_url" text,
	"duration" integer,
	"status" varchar DEFAULT 'queued' NOT NULL,
	"test_video" boolean DEFAULT false,
	"error_message" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"generated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "lessons" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" varchar NOT NULL,
	"title" text NOT NULL,
	"script" text NOT NULL,
	"order" integer NOT NULL,
	"duration" integer,
	"status" varchar DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mood_entries" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"avatar_id" varchar,
	"mood" varchar NOT NULL,
	"intensity" integer DEFAULT 3,
	"notes" text,
	"avatar_response" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_plans" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar NOT NULL,
	"name" varchar NOT NULL,
	"description" text,
	"price_monthly" integer DEFAULT 0 NOT NULL,
	"duration_hours" integer,
	"avatar_limit" integer,
	"video_limit" integer,
	"course_limit" integer,
	"course_lesson_limit" integer,
	"chat_session_limit" integer,
	"memberstack_plan_id" varchar,
	"features" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_plans_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "usage_periods" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"subscription_id" varchar,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"videos_created" integer DEFAULT 0 NOT NULL,
	"courses_created" integer DEFAULT 0 NOT NULL,
	"chat_sessions_used" integer DEFAULT 0 NOT NULL,
	"mood_entries_logged" integer DEFAULT 0 NOT NULL,
	"credits_used" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_subscriptions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"plan_id" varchar NOT NULL,
	"memberstack_subscription_id" varchar,
	"status" varchar DEFAULT 'active' NOT NULL,
	"selected_avatar_id" varchar,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	"renews_at" timestamp,
	"cancelled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "avatar_profiles" ADD COLUMN "live_avatar_id" text;--> statement-breakpoint
ALTER TABLE "avatar_profiles" ADD COLUMN "heygen_video_avatar_id" text;--> statement-breakpoint
ALTER TABLE "avatar_profiles" ADD COLUMN "heygen_video_voice_id" text;--> statement-breakpoint
ALTER TABLE "avatar_profiles" ADD COLUMN "language_code" text DEFAULT 'en-US';--> statement-breakpoint
ALTER TABLE "avatar_profiles" ADD COLUMN "elevenlabs_language_code" text DEFAULT 'en';--> statement-breakpoint
ALTER TABLE "avatar_profiles" ADD COLUMN "tags" text[] DEFAULT ARRAY[]::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "avatar_profiles" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" varchar DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "memberstack_id" varchar;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "current_plan_slug" varchar DEFAULT 'free';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "trial_started_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_active_at" timestamp;--> statement-breakpoint
ALTER TABLE "chat_generated_videos" ADD CONSTRAINT "chat_generated_videos_avatar_id_avatar_profiles_id_fk" FOREIGN KEY ("avatar_id") REFERENCES "public"."avatar_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_avatar_id_avatar_profiles_id_fk" FOREIGN KEY ("avatar_id") REFERENCES "public"."avatar_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_videos" ADD CONSTRAINT "generated_videos_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mood_entries" ADD CONSTRAINT "mood_entries_avatar_id_avatar_profiles_id_fk" FOREIGN KEY ("avatar_id") REFERENCES "public"."avatar_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_periods" ADD CONSTRAINT "usage_periods_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_periods" ADD CONSTRAINT "usage_periods_subscription_id_user_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."user_subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD CONSTRAINT "user_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD CONSTRAINT "user_subscriptions_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD CONSTRAINT "user_subscriptions_selected_avatar_id_avatar_profiles_id_fk" FOREIGN KEY ("selected_avatar_id") REFERENCES "public"."avatar_profiles"("id") ON DELETE no action ON UPDATE no action;