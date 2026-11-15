CREATE TYPE "public"."account_deletion_origin" AS ENUM('app', 'web');--> statement-breakpoint
CREATE TYPE "public"."actor" AS ENUM('ai', 'professional', 'client', 'system');--> statement-breakpoint
CREATE TYPE "public"."ai_tone" AS ENUM('descontraido', 'simpatico', 'formal');--> statement-breakpoint
CREATE TYPE "public"."appointment_event_type" AS ENUM('requested', 'ai_offered', 'booked', 'confirmed', 'rescheduled', 'cancelled', 'arrived', 'done', 'no_show', 'reminder_sent', 'delay_notice_sent', 'decision_answered');--> statement-breakpoint
CREATE TYPE "public"."appointment_origin" AS ENUM('ai', 'professional');--> statement-breakpoint
CREATE TYPE "public"."appointment_status" AS ENUM('scheduled', 'confirmed', 'in_service', 'done', 'cancelled', 'no_show');--> statement-breakpoint
CREATE TYPE "public"."client_origin" AS ENUM('whatsapp', 'manual');--> statement-breakpoint
CREATE TYPE "public"."conversation_handler" AS ENUM('ai', 'human');--> statement-breakpoint
CREATE TYPE "public"."decision_status" AS ENUM('pending', 'resolved', 'expired');--> statement-breakpoint
CREATE TYPE "public"."decision_type" AS ENUM('encaixe', 'novo_horario', 'remarcar', 'atraso', 'duvida');--> statement-breakpoint
CREATE TYPE "public"."decision_via" AS ENUM('voice', 'notification', 'app', 'alexa', 'timeout');--> statement-breakpoint
CREATE TYPE "public"."device_platform" AS ENUM('android', 'ios');--> statement-breakpoint
CREATE TYPE "public"."message_author" AS ENUM('client', 'ai', 'professional');--> statement-breakpoint
CREATE TYPE "public"."message_direction" AS ENUM('in', 'out');--> statement-breakpoint
CREATE TYPE "public"."message_kind" AS ENUM('text', 'audio');--> statement-breakpoint
CREATE TYPE "public"."otp_purpose" AS ENUM('login', 'delete_account');--> statement-breakpoint
CREATE TYPE "public"."plan" AS ENUM('essencial', 'maos_livres', 'salao', 'premium');--> statement-breakpoint
CREATE TYPE "public"."professional_role" AS ENUM('owner', 'professional');--> statement-breakpoint
CREATE TYPE "public"."waitlist_entry_status" AS ENUM('waiting', 'offered', 'booked', 'removed');--> statement-breakpoint
CREATE TYPE "public"."waitlist_offer_status" AS ENUM('sent', 'accepted', 'declined', 'expired');--> statement-breakpoint
CREATE TYPE "public"."whatsapp_provider" AS ENUM('baileys', 'cloud');--> statement-breakpoint
CREATE TYPE "public"."whatsapp_status" AS ENUM('disconnected', 'waiting_qr', 'connecting', 'connected', 'error');--> statement-breakpoint
CREATE TABLE "account_deletions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"phone_hash" text NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"origin" "account_deletion_origin" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"professional_id" uuid NOT NULL,
	"conversation_id" uuid,
	"client_id" uuid,
	"type" "decision_type" NOT NULL,
	"question" text NOT NULL,
	"context" jsonb NOT NULL,
	"options" jsonb NOT NULL,
	"proposed_action" jsonb,
	"status" "decision_status" DEFAULT 'pending' NOT NULL,
	"deadline_at" timestamp with time zone NOT NULL,
	"timeout_notified_at" timestamp with time zone,
	"resolved_via" "decision_via",
	"resolved_option" text,
	"resolved_text" text
);
--> statement-breakpoint
CREATE TABLE "appointment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"appointment_id" uuid NOT NULL,
	"type" "appointment_event_type" NOT NULL,
	"description" text NOT NULL,
	"actor" "actor" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointment_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"appointment_id" uuid NOT NULL,
	"service_id" uuid,
	"name" text NOT NULL,
	"duration_min" integer NOT NULL,
	"price_cents" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"professional_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" "appointment_status" DEFAULT 'scheduled' NOT NULL,
	"origin" "appointment_origin" NOT NULL,
	"is_fit_in" boolean DEFAULT false NOT NULL,
	"price_cents" integer NOT NULL,
	"cancel_reason" text
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"professional_id" uuid,
	"actor" "actor" NOT NULL,
	"action" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"professional_id" uuid NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"preferences" jsonb DEFAULT '{"notes":[]}'::jsonb NOT NULL,
	"origin" "client_origin" DEFAULT 'manual' NOT NULL,
	"first_contact_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"professional_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"handler" "conversation_handler" DEFAULT 'ai' NOT NULL,
	"unread_count" integer DEFAULT 0 NOT NULL,
	"last_message_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"professional_id" uuid NOT NULL,
	"push_token" text NOT NULL,
	"platform" "device_platform" NOT NULL,
	CONSTRAINT "devices_push_token_unique" UNIQUE("push_token")
);
--> statement-breakpoint
CREATE TABLE "kit_leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"professional_id" uuid NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"profession" text,
	"message" text,
	"source" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"direction" "message_direction" NOT NULL,
	"author" "message_author" NOT NULL,
	"kind" "message_kind" DEFAULT 'text' NOT NULL,
	"text" text,
	"transcription" text,
	"ai_note" text,
	"provider_message_id" text,
	CONSTRAINT "messages_provider_message_id_unique" UNIQUE("provider_message_id")
);
--> statement-breakpoint
CREATE TABLE "otp_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"phone" text NOT NULL,
	"code_hash" text NOT NULL,
	"purpose" "otp_purpose" DEFAULT 'login' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "professionals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"salon_id" uuid NOT NULL,
	"role" "professional_role" NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"professions" text[] DEFAULT '{}' NOT NULL,
	"address" text,
	"ai_enabled" boolean DEFAULT true NOT NULL,
	"ai_paused_until" timestamp with time zone,
	"ai_tone" "ai_tone" DEFAULT 'simpatico' NOT NULL,
	"autonomy" jsonb DEFAULT '{"answer_price_address":true,"confirm_reminders":true,"book_free_slot_known_client":false,"cancel_on_request":true,"change_other_client":false}'::jsonb NOT NULL,
	"reminder_lead_minutes" integer DEFAULT 120 NOT NULL,
	"welcome_message" text,
	"quiet_hours" jsonb,
	"waitlist_rule" jsonb DEFAULT '{"enabled":true,"peoplePerSlot":1,"waitMinutes":10}'::jsonb NOT NULL,
	"skip_message_preview" boolean DEFAULT false NOT NULL,
	"voice_rate" real DEFAULT 1 NOT NULL,
	CONSTRAINT "professionals_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "salons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"plan" "plan" DEFAULT 'essencial' NOT NULL,
	"timezone" text DEFAULT 'America/Sao_Paulo' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"professional_id" uuid NOT NULL,
	"name" text NOT NULL,
	"duration_min" integer NOT NULL,
	"price_cents" integer NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_off" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"professional_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "waitlist_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"professional_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"service_id" uuid,
	"preference" jsonb NOT NULL,
	"opted_in_at" timestamp with time zone NOT NULL,
	"source_message_id" uuid,
	"status" "waitlist_entry_status" DEFAULT 'waiting' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waitlist_offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"entry_id" uuid NOT NULL,
	"slot_starts_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"status" "waitlist_offer_status" DEFAULT 'sent' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"professional_id" uuid NOT NULL,
	"instance_name" text NOT NULL,
	"provider" "whatsapp_provider" DEFAULT 'baileys' NOT NULL,
	"status" "whatsapp_status" DEFAULT 'disconnected' NOT NULL,
	"phone" text,
	CONSTRAINT "whatsapp_sessions_professional_id_unique" UNIQUE("professional_id"),
	CONSTRAINT "whatsapp_sessions_instance_name_unique" UNIQUE("instance_name")
);
--> statement-breakpoint
CREATE TABLE "working_hours" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"professional_id" uuid NOT NULL,
	"weekday" integer NOT NULL,
	"start" text NOT NULL,
	"end" text NOT NULL,
	"lunch_start" text,
	"lunch_end" text
);
--> statement-breakpoint
ALTER TABLE "ai_decisions" ADD CONSTRAINT "ai_decisions_professional_id_professionals_id_fk" FOREIGN KEY ("professional_id") REFERENCES "public"."professionals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_decisions" ADD CONSTRAINT "ai_decisions_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_decisions" ADD CONSTRAINT "ai_decisions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_events" ADD CONSTRAINT "appointment_events_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_services" ADD CONSTRAINT "appointment_services_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_services" ADD CONSTRAINT "appointment_services_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_professional_id_professionals_id_fk" FOREIGN KEY ("professional_id") REFERENCES "public"."professionals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_professional_id_professionals_id_fk" FOREIGN KEY ("professional_id") REFERENCES "public"."professionals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_professional_id_professionals_id_fk" FOREIGN KEY ("professional_id") REFERENCES "public"."professionals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_professional_id_professionals_id_fk" FOREIGN KEY ("professional_id") REFERENCES "public"."professionals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_professional_id_professionals_id_fk" FOREIGN KEY ("professional_id") REFERENCES "public"."professionals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kit_leads" ADD CONSTRAINT "kit_leads_professional_id_professionals_id_fk" FOREIGN KEY ("professional_id") REFERENCES "public"."professionals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professionals" ADD CONSTRAINT "professionals_salon_id_salons_id_fk" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_professional_id_professionals_id_fk" FOREIGN KEY ("professional_id") REFERENCES "public"."professionals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_off" ADD CONSTRAINT "time_off_professional_id_professionals_id_fk" FOREIGN KEY ("professional_id") REFERENCES "public"."professionals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_professional_id_professionals_id_fk" FOREIGN KEY ("professional_id") REFERENCES "public"."professionals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_source_message_id_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_offers" ADD CONSTRAINT "waitlist_offers_entry_id_waitlist_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."waitlist_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_sessions" ADD CONSTRAINT "whatsapp_sessions_professional_id_professionals_id_fk" FOREIGN KEY ("professional_id") REFERENCES "public"."professionals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "working_hours" ADD CONSTRAINT "working_hours_professional_id_professionals_id_fk" FOREIGN KEY ("professional_id") REFERENCES "public"."professionals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_decisions_professional_status_idx" ON "ai_decisions" USING btree ("professional_id","status");--> statement-breakpoint
CREATE INDEX "appointment_events_appointment_idx" ON "appointment_events" USING btree ("appointment_id","created_at");--> statement-breakpoint
CREATE INDEX "appointment_services_appointment_idx" ON "appointment_services" USING btree ("appointment_id");--> statement-breakpoint
CREATE INDEX "appointments_professional_starts_idx" ON "appointments" USING btree ("professional_id","starts_at");--> statement-breakpoint
CREATE INDEX "appointments_client_idx" ON "appointments" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "audit_log_professional_idx" ON "audit_log" USING btree ("professional_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "clients_professional_phone_uq" ON "clients" USING btree ("professional_id","phone");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_professional_client_uq" ON "conversations" USING btree ("professional_id","client_id");--> statement-breakpoint
CREATE INDEX "conversations_professional_last_idx" ON "conversations" USING btree ("professional_id","last_message_at");--> statement-breakpoint
CREATE INDEX "devices_professional_idx" ON "devices" USING btree ("professional_id");--> statement-breakpoint
CREATE INDEX "messages_conversation_idx" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "otp_codes_phone_purpose_uq" ON "otp_codes" USING btree ("phone","purpose");--> statement-breakpoint
CREATE INDEX "professionals_salon_idx" ON "professionals" USING btree ("salon_id");--> statement-breakpoint
CREATE INDEX "services_professional_idx" ON "services" USING btree ("professional_id","position");--> statement-breakpoint
CREATE INDEX "time_off_professional_idx" ON "time_off" USING btree ("professional_id","starts_at");--> statement-breakpoint
CREATE INDEX "waitlist_entries_professional_idx" ON "waitlist_entries" USING btree ("professional_id","status","opted_in_at");--> statement-breakpoint
CREATE INDEX "waitlist_offers_entry_idx" ON "waitlist_offers" USING btree ("entry_id");--> statement-breakpoint
CREATE UNIQUE INDEX "working_hours_professional_weekday_uq" ON "working_hours" USING btree ("professional_id","weekday");