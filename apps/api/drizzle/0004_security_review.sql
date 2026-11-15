CREATE TABLE "refresh_families" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"professional_id" uuid NOT NULL,
	"gen" integer NOT NULL,
	"revoked_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alexa_tokens" ADD COLUMN "refresh_expires_at" timestamp with time zone DEFAULT now() + interval '90 days' NOT NULL;--> statement-breakpoint
ALTER TABLE "professionals" ADD COLUMN "joined_at" timestamp with time zone DEFAULT now();--> statement-breakpoint
ALTER TABLE "refresh_families" ADD CONSTRAINT "refresh_families_professional_id_professionals_id_fk" FOREIGN KEY ("professional_id") REFERENCES "public"."professionals"("id") ON DELETE cascade ON UPDATE no action;