ALTER TABLE "professionals" ADD COLUMN "phone_verified_at" timestamp with time zone;--> statement-breakpoint
-- Everyone so far proved the phone with a code (team invites once they joined).
UPDATE "professionals" SET "phone_verified_at" = COALESCE("joined_at", "created_at") WHERE "joined_at" IS NOT NULL;
