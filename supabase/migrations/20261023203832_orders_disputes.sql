CREATE TYPE "public"."dispute_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TABLE "order_disputes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"status" "dispute_status" DEFAULT 'open' NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "order_disputes_reason_check" CHECK (length(btrim("order_disputes"."reason")) between 1 and 500),
	CONSTRAINT "order_disputes_closed_at_check" CHECK (("order_disputes"."status" = 'closed') = ("order_disputes"."closed_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "order_disputes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "order_disputes" ADD CONSTRAINT "order_disputes_order_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_disputes_order_idx" ON "order_disputes" USING btree ("order_id");--> statement-breakpoint
-- One open dispute per order. Closed ones don't count, so a new dispute can follow a closed one.
CREATE UNIQUE INDEX "order_disputes_open_order_unique" ON "order_disputes" USING btree ("order_id") WHERE "order_disputes"."status" = 'open';--> statement-breakpoint

-- Who may read and open disputes: a person needs disputes.manage at the order's store.
-- Platform developers hold it everywhere, the same as orders.create for the test-order tool.
-- Only orders that still hold captured money (part_captured or captured) can be disputed.
create policy "members can read disputes of their stores" on public.order_disputes
  for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id and public.has_permission('disputes.manage', o.store_id)
    )
  );

create policy "members can open disputes on captured orders in their stores" on public.order_disputes
  for insert to authenticated
  with check (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and o.status in ('part_captured', 'captured')
        and public.has_permission('disputes.manage', o.store_id)
    )
  );

-- Newer hosted Supabase projects don't grant the API roles access to new tables automatically.
-- Local Supabase grants everything, hosted grants nothing, so revoke first and then grant back
-- only what is needed. Disputes are opened and read, never edited or deleted.
revoke all on table public.order_disputes from anon, authenticated;

grant select, insert on table public.order_disputes to authenticated;
