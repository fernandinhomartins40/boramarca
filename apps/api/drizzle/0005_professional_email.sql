ALTER TABLE "professionals" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "professionals" ADD COLUMN "email_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "professionals" ADD COLUMN "email_token_hash" text;--> statement-breakpoint
ALTER TABLE "professionals" ADD COLUMN "email_token_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "professionals" ADD CONSTRAINT "professionals_email_token_hash_unique" UNIQUE("email_token_hash");