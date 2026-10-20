CREATE INDEX "orders_customer_email_idx" ON "orders" USING btree ("customer_email");--> statement-breakpoint
-- Existing emails may have capitals. Lower-case them first, so the check below can be added.
UPDATE "orders" SET "customer_email" = lower("customer_email") WHERE "customer_email" <> lower("customer_email");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_email_lowercase_check" CHECK ("orders"."customer_email" = lower("orders"."customer_email"));