-- One statement per table, so Postgres rewrites each table once.
ALTER TABLE "order_lines"
  DROP COLUMN "total_amount",
  DROP COLUMN "total_tax_amount",
  ADD COLUMN "total_amount" bigint GENERATED ALWAYS AS (unit_price::bigint * quantity) STORED NOT NULL,
  ADD COLUMN "total_tax_amount" bigint GENERATED ALWAYS AS (round((unit_price::bigint * quantity)::numeric * tax_rate / (10000 + tax_rate))::bigint) STORED NOT NULL;--> statement-breakpoint
ALTER TABLE "orders"
  ALTER COLUMN "total_amount" SET DATA TYPE bigint,
  ALTER COLUMN "captured_amount" SET DATA TYPE bigint,
  ALTER COLUMN "refunded_amount" SET DATA TYPE bigint;