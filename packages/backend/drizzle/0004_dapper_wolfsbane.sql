CREATE TABLE "user_preferences" (
	"user_id" varchar(100) PRIMARY KEY NOT NULL,
	"quiet_start" time,
	"quiet_end" time,
	"timezone" varchar(50) DEFAULT 'America/New_York' NOT NULL,
	"daily_push_cap" integer DEFAULT 20 NOT NULL,
	"push_non_watchlist" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
