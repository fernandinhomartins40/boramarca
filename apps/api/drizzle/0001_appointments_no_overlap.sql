-- Plan section 3: the database is the last line of defense against double booking.
-- Two active appointments (scheduled, confirmed, in_service) of the same professional
-- can never overlap on [starts_at, ends_at). Cancelled/done/no_show rows are ignored.
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_ends_after_starts" CHECK ("ends_at" > "starts_at");
--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_no_overlap" EXCLUDE USING gist (
  "professional_id" WITH =,
  tstzrange("starts_at", "ends_at", '[)') WITH &&
) WHERE ("status" IN ('scheduled', 'confirmed', 'in_service'));
--> statement-breakpoint
ALTER TABLE "time_off" ADD CONSTRAINT "time_off_ends_after_starts" CHECK ("ends_at" > "starts_at");
