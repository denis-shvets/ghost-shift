CREATE TYPE "public"."scheduled_checkout_status" AS ENUM('pending', 'placing', 'placed', 'failed', 'skipped');--> statement-breakpoint
ALTER TYPE "public"."order_event_action" ADD VALUE 'shipped';--> statement-breakpoint
CREATE TABLE "scheduled_checkouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_by" uuid DEFAULT auth.uid() NOT NULL,
	"store_id" uuid NOT NULL,
	"persona" text NOT NULL,
	"plan_id" uuid NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "scheduled_checkout_status" DEFAULT 'pending' NOT NULL,
	"order_id" uuid,
	"error" text,
	"released_at" timestamp with time zone,
	CONSTRAINT "scheduled_checkouts_persona_length_check" CHECK (char_length("scheduled_checkouts"."persona") between 1 and 60),
	CONSTRAINT "scheduled_checkouts_order_when_placed_check" CHECK (("scheduled_checkouts"."status" = 'placed') = ("scheduled_checkouts"."order_id" is not null)),
	CONSTRAINT "scheduled_checkouts_payload_store_check" CHECK ("scheduled_checkouts"."payload" ->> 'storeId' is not distinct from "scheduled_checkouts"."store_id"::text),
	CONSTRAINT "scheduled_checkouts_payload_shipped_check" CHECK (not "scheduled_checkouts"."payload" ? 'shipped')
);
--> statement-breakpoint
ALTER TABLE "scheduled_checkouts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "created_by" uuid DEFAULT auth.uid();--> statement-breakpoint
ALTER TABLE "scheduled_checkouts" ADD CONSTRAINT "scheduled_checkouts_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_checkouts" ADD CONSTRAINT "scheduled_checkouts_store_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_checkouts" ADD CONSTRAINT "scheduled_checkouts_order_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scheduled_checkouts_status_due_at_idx" ON "scheduled_checkouts" USING btree ("status","due_at");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;