CREATE TABLE "content_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"source_url" text NOT NULL,
	"title" text NOT NULL,
	"authors" jsonb,
	"published_at" timestamp NOT NULL,
	"harvested_at" timestamp DEFAULT now(),
	"raw_text" text,
	"content_hash" text NOT NULL,
	"taxonomy" jsonb,
	"concepts" jsonb,
	"difficulty_level" text,
	"infographic_url" text,
	"summary" jsonb,
	"podcast_url" text,
	"podcast_duration_sec" integer,
	"critic_scores" jsonb,
	"cohort_rank" jsonb,
	"justification" jsonb,
	"trend_ids" jsonb,
	"embedding" vector(768),
	"processing_status" text DEFAULT 'harvested',
	"citation_count" integer DEFAULT 0,
	"engagement_score" real DEFAULT 0,
	"global_quality" real DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "content_items_content_hash_unique" UNIQUE("content_hash")
);
--> statement-breakpoint
CREATE TABLE "engagements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"content_id" uuid,
	"event_type" text NOT NULL,
	"duration_sec" integer,
	"pass_level" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"content_id" uuid,
	"feedback_type" text NOT NULL,
	"value" real,
	"tags" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "processing_registry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"content_hash" text NOT NULL,
	"content_item_id" uuid,
	"stages" jsonb,
	"first_seen_at" timestamp DEFAULT now(),
	"last_checked_at" timestamp DEFAULT now(),
	CONSTRAINT "processing_registry_source_unique" UNIQUE("source_type","source_id")
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	"updated_by" uuid,
	CONSTRAINT "system_settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "trends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"category" text,
	"description" text,
	"narrative" text,
	"status" text DEFAULT 'emerging',
	"momentum_score" real NOT NULL,
	"z_score" real NOT NULL,
	"signals" jsonb,
	"evidence_ids" jsonb,
	"centroid_embedding" vector(768),
	"detected_at" timestamp DEFAULT now(),
	"peaked_at" timestamp,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "trends_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"role" text,
	"free_text_interests" jsonb,
	"structured_interests" jsonb,
	"interest_embedding" vector(768),
	"settings" jsonb,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "engagements" ADD CONSTRAINT "engagements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagements" ADD CONSTRAINT "engagements_content_id_content_items_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_content_id_content_items_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processing_registry" ADD CONSTRAINT "processing_registry_content_item_id_content_items_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "content_items_status_idx" ON "content_items" USING btree ("processing_status");--> statement-breakpoint
CREATE INDEX "content_items_source_type_idx" ON "content_items" USING btree ("source_type");--> statement-breakpoint
CREATE INDEX "content_items_published_at_idx" ON "content_items" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "processing_registry_hash_idx" ON "processing_registry" USING btree ("content_hash");