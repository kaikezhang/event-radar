ALTER TABLE "delivery_kill_switch" ADD COLUMN "updated_by" varchar(50);--> statement-breakpoint
ALTER TABLE "event_outcomes" ADD COLUMN "price_t5" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "event_outcomes" ADD COLUMN "price_t20" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "event_outcomes" ADD COLUMN "change_t5" numeric(8, 4);--> statement-breakpoint
ALTER TABLE "event_outcomes" ADD COLUMN "change_t20" numeric(8, 4);--> statement-breakpoint
ALTER TABLE "event_outcomes" ADD COLUMN "evaluated_t5_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "event_outcomes" ADD COLUMN "evaluated_t20_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pipeline_audit" ADD COLUMN "confidence" numeric(5, 4);