CREATE TYPE "public"."billing_cycle" AS ENUM('monthly', 'yearly');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('trial', 'active', 'past_due', 'canceled', 'expired');--> statement-breakpoint
CREATE TABLE "billing_events" (
	"id" text PRIMARY KEY NOT NULL,
	"event" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"salon_id" uuid NOT NULL,
	"asaas_id" text NOT NULL,
	"value_cents" integer NOT NULL,
	"due_date" date NOT NULL,
	"status" text NOT NULL,
	"invoice_url" text,
	"paid_at" date,
	CONSTRAINT "billing_payments_asaas_id_unique" UNIQUE("asaas_id")
);
--> statement-breakpoint
ALTER TABLE "salons" ADD COLUMN "trial_ends_at" timestamp with time zone DEFAULT now() + interval '14 days';--> statement-breakpoint
ALTER TABLE "salons" ADD COLUMN "subscription_status" "subscription_status" DEFAULT 'trial' NOT NULL;--> statement-breakpoint
ALTER TABLE "salons" ADD COLUMN "billing_cycle" "billing_cycle";--> statement-breakpoint
ALTER TABLE "salons" ADD COLUMN "billing_seats" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "salons" ADD COLUMN "billing_value_cents" integer;--> statement-breakpoint
ALTER TABLE "salons" ADD COLUMN "asaas_customer_id" text;--> statement-breakpoint
ALTER TABLE "salons" ADD COLUMN "asaas_subscription_id" text;--> statement-breakpoint
ALTER TABLE "salons" ADD COLUMN "billing_cpf_cnpj" text;--> statement-breakpoint
ALTER TABLE "salons" ADD COLUMN "billing_email" text;--> statement-breakpoint
ALTER TABLE "salons" ADD COLUMN "next_due_date" date;--> statement-breakpoint
ALTER TABLE "billing_payments" ADD CONSTRAINT "billing_payments_salon_id_salons_id_fk" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billing_payments_salon_idx" ON "billing_payments" USING btree ("salon_id","due_date");--> statement-breakpoint
ALTER TABLE "salons" ADD CONSTRAINT "salons_asaas_customer_id_unique" UNIQUE("asaas_customer_id");--> statement-breakpoint
ALTER TABLE "salons" ADD CONSTRAINT "salons_asaas_subscription_id_unique" UNIQUE("asaas_subscription_id");--> statement-breakpoint
-- Salons from before billing (the demo, the store review account, early users): active and exempt.
UPDATE "salons" SET "subscription_status" = 'active', "trial_ends_at" = NULL;
