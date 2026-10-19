ALTER TABLE "orders" DROP CONSTRAINT "orders_shopper_country_format_check";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "shopper_name";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "shopper_email";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "shopper_country";