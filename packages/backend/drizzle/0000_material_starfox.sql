CREATE TABLE "alert_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"priority" varchar(20) NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"suppressed" boolean DEFAULT false NOT NULL,
	"suppression_reason" text
);
--> statement-breakpoint
CREATE TABLE "alert_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"dsl" text NOT NULL,
	"conditions_ast" jsonb NOT NULL,
	"actions" jsonb NOT NULL,
	"rule_order" integer NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget_config" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"max_alerts_per_hour" integer DEFAULT 50 NOT NULL,
	"priority_shares" jsonb NOT NULL,
	"window_minutes" integer DEFAULT 60 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "classification_outcomes" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"actual_direction" varchar(20) NOT NULL,
	"price_change_1h" numeric(10, 4) NOT NULL,
	"price_change_1d" numeric(10, 4) NOT NULL,
	"price_change_1w" numeric(10, 4) NOT NULL,
	"evaluated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "classification_outcomes_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
CREATE TABLE "classification_predictions" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"predicted_severity" varchar(20) NOT NULL,
	"predicted_direction" varchar(20) NOT NULL,
	"confidence" numeric(5, 4) NOT NULL,
	"classified_by" varchar(20) NOT NULL,
	"classified_at" timestamp with time zone NOT NULL,
	CONSTRAINT "classification_predictions_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
CREATE TABLE "deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"channel" varchar(50) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"error" text,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "delivery_kill_switch" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"activated_at" timestamp with time zone,
	"reason" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_outcomes" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"ticker" varchar(10) NOT NULL,
	"event_time" timestamp with time zone NOT NULL,
	"event_price" numeric(10, 2),
	"price_1h" numeric(10, 2),
	"price_1d" numeric(10, 2),
	"price_1w" numeric(10, 2),
	"price_1m" numeric(10, 2),
	"change_1h" numeric(10, 4),
	"change_1d" numeric(10, 4),
	"change_1w" numeric(10, 4),
	"change_1m" numeric(10, 4),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_outcomes_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" varchar(100) NOT NULL,
	"source_event_id" varchar(255),
	"title" text NOT NULL,
	"summary" text,
	"raw_payload" jsonb,
	"metadata" jsonb,
	"severity" varchar(20),
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"merged_from" text[],
	"source_urls" jsonb,
	"is_duplicate" boolean DEFAULT false,
	"confirmed_sources" jsonb,
	"confirmation_count" integer DEFAULT 1
);
--> statement-breakpoint
CREATE TABLE "pipeline_audit" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" varchar(100) NOT NULL,
	"source" varchar(100) NOT NULL,
	"title" text NOT NULL,
	"severity" varchar(20),
	"ticker" varchar(20),
	"outcome" varchar(30) NOT NULL,
	"stopped_at" varchar(30) NOT NULL,
	"reason" text,
	"reason_category" varchar(30),
	"delivery_channels" jsonb,
	"historical_match" boolean,
	"historical_confidence" varchar(20),
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_cache" (
	"ticker" varchar(10) NOT NULL,
	"date" date NOT NULL,
	"close_price" numeric(10, 2),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "price_cache_ticker_date_pk" PRIMARY KEY("ticker","date")
);
--> statement-breakpoint
CREATE TABLE "reclassification_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"reason" varchar(50) NOT NULL,
	"priority" integer NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reclassification_queue_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
CREATE TABLE "severity_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"previous_severity" varchar(20) NOT NULL,
	"new_severity" varchar(20) NOT NULL,
	"reason" text NOT NULL,
	"changed_by" varchar(20) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "severity_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"severity" varchar(20) NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"locked_by" varchar(20),
	"source_count" integer DEFAULT 1 NOT NULL,
	"reason" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "severity_overrides_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
CREATE TABLE "source_weights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" varchar(100) NOT NULL,
	"weight" numeric(5, 4) NOT NULL,
	"sample_size" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_weights_source_unique" UNIQUE("source")
);
--> statement-breakpoint
CREATE TABLE "story_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"story_group_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"sequence_number" integer NOT NULL,
	"is_key_event" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "story_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"tickers" jsonb NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"severity" varchar(20) NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"event_count" integer DEFAULT 1 NOT NULL,
	"first_event_at" timestamp with time zone NOT NULL,
	"last_event_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"verdict" varchar(30) NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_feedback_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
CREATE TABLE "watchlist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticker" varchar(10) NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notes" text,
	CONSTRAINT "watchlist_ticker_unique" UNIQUE("ticker")
);
--> statement-breakpoint
CREATE TABLE "weight_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"previous_weights" jsonb NOT NULL,
	"new_weights" jsonb NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alert_log" ADD CONSTRAINT "alert_log_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classification_outcomes" ADD CONSTRAINT "classification_outcomes_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classification_predictions" ADD CONSTRAINT "classification_predictions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_outcomes" ADD CONSTRAINT "event_outcomes_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reclassification_queue" ADD CONSTRAINT "reclassification_queue_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "severity_changes" ADD CONSTRAINT "severity_changes_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "severity_overrides" ADD CONSTRAINT "severity_overrides_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_events" ADD CONSTRAINT "story_events_story_group_id_story_groups_id_fk" FOREIGN KEY ("story_group_id") REFERENCES "public"."story_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_events" ADD CONSTRAINT "story_events_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_feedback" ADD CONSTRAINT "user_feedback_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_alert_log_event_id" ON "alert_log" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "idx_alert_log_sent_at" ON "alert_log" USING btree ("sent_at");--> statement-breakpoint
CREATE INDEX "idx_alert_log_suppressed" ON "alert_log" USING btree ("suppressed");--> statement-breakpoint
CREATE INDEX "idx_alert_rules_rule_order" ON "alert_rules" USING btree ("rule_order");--> statement-breakpoint
CREATE INDEX "idx_alert_rules_enabled" ON "alert_rules" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "idx_budget_config_updated_at" ON "budget_config" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "idx_classification_outcomes_event_id" ON "classification_outcomes" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "idx_classification_outcomes_evaluated_at" ON "classification_outcomes" USING btree ("evaluated_at");--> statement-breakpoint
CREATE INDEX "idx_classification_predictions_event_id" ON "classification_predictions" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "idx_classification_predictions_classified_at" ON "classification_predictions" USING btree ("classified_at");--> statement-breakpoint
CREATE INDEX "idx_event_outcomes_ticker" ON "event_outcomes" USING btree ("ticker");--> statement-breakpoint
CREATE INDEX "idx_event_outcomes_event_time" ON "event_outcomes" USING btree ("event_time");--> statement-breakpoint
CREATE INDEX "idx_pipeline_audit_created_at" ON "pipeline_audit" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_pipeline_audit_source" ON "pipeline_audit" USING btree ("source");--> statement-breakpoint
CREATE INDEX "idx_pipeline_audit_outcome" ON "pipeline_audit" USING btree ("outcome");--> statement-breakpoint
CREATE INDEX "idx_pipeline_audit_ticker" ON "pipeline_audit" USING btree ("ticker");--> statement-breakpoint
CREATE INDEX "idx_reclassification_queue_status" ON "reclassification_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_reclassification_queue_priority" ON "reclassification_queue" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "idx_severity_changes_event_id" ON "severity_changes" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "idx_severity_changes_created_at" ON "severity_changes" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_severity_overrides_event_id" ON "severity_overrides" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "idx_severity_overrides_locked" ON "severity_overrides" USING btree ("locked");--> statement-breakpoint
CREATE INDEX "idx_source_weights_source" ON "source_weights" USING btree ("source");--> statement-breakpoint
CREATE INDEX "idx_story_events_story_group_id" ON "story_events" USING btree ("story_group_id");--> statement-breakpoint
CREATE INDEX "idx_story_events_event_id" ON "story_events" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "idx_story_groups_status" ON "story_groups" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_story_groups_last_event_at" ON "story_groups" USING btree ("last_event_at");--> statement-breakpoint
CREATE INDEX "idx_user_feedback_event_id" ON "user_feedback" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "idx_watchlist_ticker" ON "watchlist" USING btree ("ticker");--> statement-breakpoint
CREATE INDEX "idx_weight_adjustments_created_at" ON "weight_adjustments" USING btree ("created_at");