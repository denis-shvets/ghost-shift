CREATE TYPE "public"."address_kind" AS ENUM('billing', 'shipping');--> statement-breakpoint
CREATE TYPE "public"."order_event_action" AS ENUM('authorized', 'captured', 'refunded', 'canceled', 'expired');--> statement-breakpoint
CREATE TABLE "order_addresses" (
	"order_id" uuid NOT NULL,
	"kind" "address_kind" NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"company" text,
	"street_address" text NOT NULL,
	"street_address2" text,
	"postal_code" text NOT NULL,
	"city" text NOT NULL,
	"region" text,
	"country" char(2) NOT NULL,
	"phone" text,
	CONSTRAINT "order_addresses_pk" PRIMARY KEY("order_id","kind"),
	CONSTRAINT "order_addresses_country_format_check" CHECK ("order_addresses"."country" ~ '^[A-Z]{2}$')
);
--> statement-breakpoint
ALTER TABLE "order_addresses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "order_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"action" "order_event_action" NOT NULL,
	"actor_user_id" uuid,
	"actor_name" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "order_events_metadata_object_check" CHECK (jsonb_typeof("order_events"."metadata") = 'object')
);
--> statement-breakpoint
ALTER TABLE "order_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
-- Hand-written: part_refunded is gone. Refunds are read from refunded_amount, so the status
-- goes back to what the capture says.
UPDATE "orders" SET "status" = CASE WHEN "captured_amount" = "total_amount" THEN 'captured' ELSE 'part_captured' END WHERE "status" = 'part_refunded';--> statement-breakpoint
DROP TYPE "public"."order_status";--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('authorized', 'captured', 'part_captured', 'expired', 'canceled', 'refunded');--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "status" SET DATA TYPE "public"."order_status" USING "status"::"public"."order_status";--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "payment_method" SET DATA TYPE text;--> statement-breakpoint
-- Hand-written: map the old methods that no longer exist.
UPDATE "orders" SET "payment_method" = CASE "payment_method" WHEN 'invoice' THEN 'bank_transfer' WHEN 'wallet' THEN 'paypal' ELSE "payment_method" END;--> statement-breakpoint
DROP TYPE "public"."payment_method";--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('amazon_pay', 'amex', 'apple_pay', 'bank_transfer', 'card', 'google_pay', 'paypal');--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "payment_method" SET DATA TYPE "public"."payment_method" USING "payment_method"::"public"."payment_method";--> statement-breakpoint
-- Hand-written: the customer columns start empty, get filled from the shopper columns,
-- and only then become required. A follow-up migration drops the shopper columns.
ALTER TABLE "orders"
  ADD COLUMN "expires_at" timestamp with time zone DEFAULT now() + interval '28 days' NOT NULL,
  ADD COLUMN "customer_first_name" text,
  ADD COLUMN "customer_last_name" text,
  ADD COLUMN "customer_email" text,
  ADD COLUMN "customer_phone" text;--> statement-breakpoint
-- Expiry follows model/payment-methods.ts: 7 days for card and wallets, 28 for the rest.
-- An order that already expired keeps an expiry in the past, never a later one.
UPDATE "orders" SET
  "expires_at" = least(
    "created_at" + CASE WHEN "payment_method" IN ('card', 'amex', 'apple_pay', 'google_pay') THEN interval '7 days' ELSE interval '28 days' END,
    CASE WHEN "status" = 'expired' THEN now() ELSE 'infinity'::timestamptz END
  ),
  "customer_first_name" = coalesce(nullif(split_part(btrim("shopper_name"), ' ', 1), ''), '-'),
  "customer_last_name" = coalesce(nullif(substr(btrim("shopper_name"), length(split_part(btrim("shopper_name"), ' ', 1)) + 2), ''), '-'),
  "customer_email" = "shopper_email";--> statement-breakpoint
ALTER TABLE "orders"
  ALTER COLUMN "customer_first_name" SET NOT NULL,
  ALTER COLUMN "customer_last_name" SET NOT NULL,
  ALTER COLUMN "customer_email" SET NOT NULL;--> statement-breakpoint
-- Hand-written: keep the shopper's country before the next migration drops it. Old orders have
-- no street, postal code or city, so those get '-'. Both kinds, like every new order.
INSERT INTO "order_addresses" ("order_id", "kind", "first_name", "last_name", "street_address", "postal_code", "city", "country")
SELECT "orders"."id", "kinds"."kind", "customer_first_name", "customer_last_name", '-', '-', '-', "shopper_country"
FROM "orders" CROSS JOIN (VALUES ('billing'::"address_kind"), ('shipping'::"address_kind")) AS "kinds" ("kind");--> statement-breakpoint
-- Hand-written: every order starts its timeline with the authorization, as new orders do.
INSERT INTO "order_events" ("order_id", "occurred_at", "action", "actor_name", "metadata")
SELECT "id", "created_at", 'authorized', 'Phantom Checkout', jsonb_build_object('amount', "total_amount") FROM "orders";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "uncaptured_amount" bigint GENERATED ALWAYS AS (total_amount - captured_amount) STORED NOT NULL;--> statement-breakpoint
ALTER TABLE "order_addresses" ADD CONSTRAINT "order_addresses_order_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_actor_user_fk" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_events_order_occurred_at_idx" ON "order_events" USING btree ("order_id","occurred_at");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_captured_amount_range_check" CHECK ("orders"."captured_amount" between 0 and "orders"."total_amount");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_refunded_amount_range_check" CHECK ("orders"."refunded_amount" between 0 and "orders"."captured_amount");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_expires_after_created_check" CHECK ("orders"."expires_at" > "orders"."created_at");