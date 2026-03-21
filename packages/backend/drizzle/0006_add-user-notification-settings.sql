CREATE TABLE "user_notification_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(100) NOT NULL,
	"discord_webhook_url" text,
	"email_address" text,
	"min_severity" varchar(20) DEFAULT 'HIGH' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_notification_settings_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "user_notification_settings" ADD CONSTRAINT "user_notification_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "watchlist_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(100) NOT NULL,
	"name" varchar(100) NOT NULL,
	"color" varchar(20) DEFAULT 'gray',
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "watchlist" ADD COLUMN "section_id" uuid;--> statement-breakpoint
ALTER TABLE "watchlist" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "watchlist_sections" ADD CONSTRAINT "watchlist_sections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_user_notification_settings_user_id" ON "user_notification_settings" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_ws_user_name" ON "watchlist_sections" USING btree ("user_id","name");--> statement-breakpoint
ALTER TABLE "watchlist" ADD CONSTRAINT "watchlist_section_id_watchlist_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."watchlist_sections"("id") ON DELETE set null ON UPDATE no action;