CREATE TABLE "payout_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"label" text NOT NULL,
	"account_holder_name" text NOT NULL,
	"last_four" char(4) NOT NULL,
	"currency" char(3) NOT NULL,
	CONSTRAINT "payout_accounts_id_organization_currency_unique" UNIQUE("id","organization_id","currency"),
	CONSTRAINT "payout_accounts_last_four_format_check" CHECK ("payout_accounts"."last_four" ~ '^[0-9]{4}$'),
	CONSTRAINT "payout_accounts_currency_format_check" CHECK ("payout_accounts"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
ALTER TABLE "payout_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "support_email" text;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "payout_account_id" uuid;--> statement-breakpoint
ALTER TABLE "payout_accounts" ADD CONSTRAINT "payout_accounts_organization_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_payout_account_fk" FOREIGN KEY ("payout_account_id","organization_id","currency") REFERENCES "public"."payout_accounts"("id","organization_id","currency") ON DELETE no action ON UPDATE no action;