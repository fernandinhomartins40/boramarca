CREATE TABLE "alexa_oauth_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"professional_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"code_challenge" text NOT NULL,
	"code_challenge_method" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alexa_settings" (
	"professional_id" uuid PRIMARY KEY NOT NULL,
	"voice_monkey_enabled" boolean DEFAULT false NOT NULL,
	"voice_monkey_device" text,
	"voice_monkey_token_enc" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alexa_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"professional_id" uuid NOT NULL,
	"access_token_hash" text NOT NULL,
	"access_expires_at" timestamp with time zone NOT NULL,
	"refresh_token_hash" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alexa_oauth_codes" ADD CONSTRAINT "alexa_oauth_codes_professional_id_professionals_id_fk" FOREIGN KEY ("professional_id") REFERENCES "public"."professionals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alexa_settings" ADD CONSTRAINT "alexa_settings_professional_id_professionals_id_fk" FOREIGN KEY ("professional_id") REFERENCES "public"."professionals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alexa_tokens" ADD CONSTRAINT "alexa_tokens_professional_id_professionals_id_fk" FOREIGN KEY ("professional_id") REFERENCES "public"."professionals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "alexa_oauth_codes_hash_uq" ON "alexa_oauth_codes" USING btree ("code_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "alexa_tokens_access_uq" ON "alexa_tokens" USING btree ("access_token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "alexa_tokens_refresh_uq" ON "alexa_tokens" USING btree ("refresh_token_hash");--> statement-breakpoint
CREATE INDEX "alexa_tokens_professional_idx" ON "alexa_tokens" USING btree ("professional_id");