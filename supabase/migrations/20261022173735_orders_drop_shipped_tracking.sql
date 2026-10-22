-- Order matters: the job and function go first, then the policy that reads the column is recreated,
-- and only then can the column be dropped.

-- Stop the warehouse job before the function it calls goes away. The select unschedules the job
-- when it exists. When no job has that name, the select finds no rows and does nothing, so the
-- migration also runs on a database that never had the job.
select cron.unschedule(jobid) from cron.job where jobname = 'ship-orders';

drop function if exists public.ship_orders();

-- Drop and recreate: the policy reads the column, and a column can't go while a policy uses it.
-- Same rule as before, minus the clause that reads the column.
drop policy "creators can create authorized orders" on public.orders;
create policy "creators can create authorized orders" on public.orders
  for insert to authenticated with check (
    -- Your own order: created_by is what the select and child-row policies trust.
    created_by = (select auth.uid())
    and public.has_permission('orders.create', store_id)
    -- A new order starts as an authorization. Capture and refund go through order_action().
    and status = 'authorized'
    and captured_amount = 0
    and refunded_amount = 0
    -- No backdating beyond what the Night Shift cron needs: it places an order up to 6 hours after
    -- its planned time (LATE_LIMIT). 5 minutes ahead allows for the Worker's clock.
    and created_at between now() - interval '7 hours' and now() + interval '5 minutes'
  );

ALTER TABLE "orders" DROP CONSTRAINT "orders_shipped_after_created_check";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "shipped_at";--> statement-breakpoint

-- The queue's payload check from 20261021085934 goes too: nothing reads that key.
ALTER TABLE "scheduled_checkouts" DROP CONSTRAINT IF EXISTS "scheduled_checkouts_payload_shipped_check";--> statement-breakpoint

-- Timeline rows of the removed action. Delete them first: the new enum lacks that value, so the cast back would fail on them.
DELETE FROM "order_events" WHERE "action" = 'shipped';--> statement-breakpoint
-- The policy reads action, and Postgres won't change a column's type while a policy uses it.
-- Drop it here, and recreate it below with the same body as in 20261021085941_night_shift_access.
DROP POLICY "creators can create order events" ON "order_events";--> statement-breakpoint
ALTER TABLE "order_events" ALTER COLUMN "action" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."order_event_action";--> statement-breakpoint
CREATE TYPE "public"."order_event_action" AS ENUM('authorized', 'captured', 'refunded', 'canceled', 'expired');--> statement-breakpoint
ALTER TABLE "order_events" ALTER COLUMN "action" SET DATA TYPE "public"."order_event_action" USING "action"::"public"."order_event_action";--> statement-breakpoint
create policy "creators can create order events" on public.order_events
  for insert to authenticated with check (
    actor_user_id = (select auth.uid())
    and action = 'authorized'
    -- Kept from agent_runs_access: only order_action() links a run to an event.
    and agent_run_id is null
    and exists (
      select 1 from public.orders o
      where o.id = order_id
        and o.created_by = (select auth.uid())
        and public.has_permission('orders.create', o.store_id)
    )
  );

-- The orders agent no longer captures, cancels or refunds. Take the three permissions away from
-- agent_second_line. Any account holding that role then gets "You don't have permission" from order_action().
-- Rows in role_permissions link a role to a permission. Deleting the row removes the permission.
delete from public.role_permissions
where role = 'agent_second_line'
  and permission in ('orders.capture', 'orders.cancel', 'orders.refund');
