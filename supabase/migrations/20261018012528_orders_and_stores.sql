CREATE TYPE "public"."order_line_type" AS ENUM('physical', 'digital', 'shipping_fee', 'discount', 'surcharge');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('authorized', 'captured', 'part_captured', 'refunded', 'part_refunded', 'canceled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('card', 'invoice', 'wallet', 'bank_transfer');--> statement-breakpoint
CREATE TYPE "public"."store_status" AS ENUM('live', 'test');--> statement-breakpoint
CREATE TABLE "order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"type" "order_line_type" NOT NULL,
	"sku" text,
	"name" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" integer NOT NULL,
	"tax_rate" integer NOT NULL,
	"total_amount" integer GENERATED ALWAYS AS (unit_price * quantity) STORED NOT NULL,
	"total_tax_amount" integer GENERATED ALWAYS AS (round((unit_price * quantity)::numeric * tax_rate / (10000 + tax_rate))::integer) STORED NOT NULL,
	CONSTRAINT "order_lines_order_position_unique" UNIQUE("order_id","position"),
	CONSTRAINT "order_lines_quantity_positive_check" CHECK ("order_lines"."quantity" > 0),
	CONSTRAINT "order_lines_tax_rate_range_check" CHECK ("order_lines"."tax_rate" between 0 and 10000),
	CONSTRAINT "order_lines_discount_sign_check" CHECK (("order_lines"."type" = 'discount') = ("order_lines"."unit_price" < 0) or "order_lines"."unit_price" = 0)
);
--> statement-breakpoint
ALTER TABLE "order_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"store_id" uuid NOT NULL,
	"currency" char(3) NOT NULL,
	"shopper_name" text NOT NULL,
	"shopper_email" text NOT NULL,
	"shopper_country" char(2) NOT NULL,
	"payment_method" "payment_method" NOT NULL,
	"status" "order_status" NOT NULL,
	"total_amount" integer NOT NULL,
	"captured_amount" integer DEFAULT 0 NOT NULL,
	"refunded_amount" integer DEFAULT 0 NOT NULL,
	"shipping_carrier" text NOT NULL,
	"shipping_tracking" text,
	CONSTRAINT "orders_reference_unique" UNIQUE("reference"),
	CONSTRAINT "orders_currency_format_check" CHECK ("orders"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "orders_shopper_country_format_check" CHECK ("orders"."shopper_country" ~ '^[A-Z]{2}$')
);
--> statement-breakpoint
ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "stores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"market" char(2) NOT NULL,
	"currency" char(3) NOT NULL,
	"status" "store_status" NOT NULL,
	CONSTRAINT "stores_id_currency_unique" UNIQUE("id","currency"),
	CONSTRAINT "stores_market_format_check" CHECK ("stores"."market" ~ '^[A-Z]{2}$'),
	CONSTRAINT "stores_currency_format_check" CHECK ("stores"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
ALTER TABLE "stores" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_order_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_store_currency_fk" FOREIGN KEY ("store_id","currency") REFERENCES "public"."stores"("id","currency") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "order lines are readable by everyone" ON "order_lines" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "orders are readable by everyone" ON "orders" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "stores are readable by everyone" ON "stores" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (true);