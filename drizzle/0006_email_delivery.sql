ALTER TABLE "outbound_emails" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "outbound_emails" ADD COLUMN "provider_message_id" text;--> statement-breakpoint
ALTER TABLE "outbound_emails" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "outbound_emails" ADD COLUMN "sent_at" timestamp with time zone;