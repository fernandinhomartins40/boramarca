ALTER TABLE "waitlist_offers" ADD COLUMN "slot_ends_at" timestamp with time zone;--> statement-breakpoint
UPDATE "waitlist_offers" SET "slot_ends_at" = "slot_starts_at" + interval '1 hour' WHERE "slot_ends_at" IS NULL;--> statement-breakpoint
ALTER TABLE "waitlist_offers" ALTER COLUMN "slot_ends_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "waitlist_offers" ADD COLUMN "service_ids" uuid[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
CREATE INDEX "waitlist_offers_slot_idx" ON "waitlist_offers" USING btree ("slot_starts_at","status");
