import { and, asc, count, desc, eq, gt, or, sql } from "drizzle-orm";

import { organizations } from "~/features/organizations/db/schema";
import { stores } from "~/features/stores/db/schema";
import type { UserClaims } from "~/shared/auth/user-claims";
import { type Database, withUser } from "~/shared/db/client";
import { keysetPage, keysetPageOrFirst } from "~/shared/db/keyset-page";
import { pgError } from "~/shared/db/pg-error";
import { isUuid } from "~/shared/ids/is-uuid";

import { orderAddresses, orderEvents, orderLines, orders } from "../db/schema";
import { type CreateOrderInput, MAX_ORDERS_PER_HOUR } from "../model/create-order-input";
import type { OrderActionInput } from "../model/order-action-input";
import type { OrderEvent } from "../model/order-event";
import type { OrderListInput } from "../model/order-list-input";
import type { OrderStatus } from "../model/order-statuses";

// Runs as the signed-in user, so row-level security decides what they can read.
// Pages are ordered by (created_at, id), so orders with the same time can't be skipped.
// The cursor is an order id: the anchor's created_at and id are looked up in the same query.
export function listOrders(
  db: Database,
  user: UserClaims,
  { limit, cursor, direction, q, status, storeId, paymentMethod }: OrderListInput,
) {
  return withUser(db, user, async (tx) => {
    // "prev" reads the orders newer than the cursor. Without a cursor there is nothing to go back from.
    const newer = direction === "prev" && cursor !== undefined;
    const anchor = sql`(select ${orders.createdAt}, ${orders.id} from ${orders} where ${orders.id} = ${cursor})`;
    // Emails are stored in lower case and references in upper case, so the search compares plain text.
    const search = q
      ? or(eq(orders.reference, q.toUpperCase()), eq(orders.customerEmail, q.toLowerCase()))
      : undefined;
    const rows = await tx
      .select({
        id: orders.id,
        reference: orders.reference,
        createdAt: orders.createdAt,
        expiresAt: orders.expiresAt,
        customerFirstName: orders.customerFirstName,
        customerLastName: orders.customerLastName,
        paymentMethod: orders.paymentMethod,
        status: orders.status,
        currency: orders.currency,
        totalAmount: orders.totalAmount,
        capturedAmount: orders.capturedAmount,
        refundedAmount: orders.refundedAmount,
        shippingCarrier: orders.shippingCarrier,
      })
      .from(orders)
      .where(
        // and() skips the undefined conditions, so each filter is only applied when it was sent.
        and(
          cursor
            ? sql`(${orders.createdAt}, ${orders.id}) ${sql.raw(newer ? ">" : "<")} ${anchor}`
            : undefined,
          search,
          status ? eq(orders.status, status) : undefined,
          storeId ? eq(orders.storeId, storeId) : undefined,
          paymentMethod ? eq(orders.paymentMethod, paymentMethod) : undefined,
        ),
      )
      .orderBy(
        newer ? asc(orders.createdAt) : desc(orders.createdAt),
        newer ? asc(orders.id) : desc(orders.id),
      )
      // One extra row tells us whether another page exists in this direction.
      .limit(limit + 1);

    const { page, nextCursor, prevCursor } = keysetPage(rows, { limit, cursor, newer });
    return { orders: page, nextCursor, prevCursor };
  });
}

// A cursor the user can't see gives an empty page with no links, so fall back to the first page.
// The filters stay, so the first page is still the filtered one.
// shortcut: one extra query only when the cursor is invisible, upgrade if that path gets hot
export function listOrdersOrFirstPage(db: Database, user: UserClaims, input: OrderListInput) {
  return keysetPageOrFirst(
    input,
    (next) => listOrders(db, user, next),
    (page) => page.orders.length === 0,
  );
}

// Thrown when the store is missing or not visible to the user (RLS hides it the same way).
export class StoreNotFoundError extends Error {}

// Thrown when the user can see the store but may not create orders in it (no orders.create).
export class OrderCreateForbiddenError extends Error {}

// Thrown when a limit is reached: too many orders this hour, or too many pending scheduled checkouts.
export class LimitReachedError extends Error {}

const HOUR = 60 * 60 * 1000;

// Runs as the signed-in user. public.create_order() is the only way in: it computes the total and
// the expiry, and writes the order, lines, addresses and first event in one transaction.
// `createdAt` is for server code only: the Night Shift cron places a planned order at its planned
// time. No request input carries it, so API callers can't backdate an order.
export async function createOrder(
  db: Database,
  user: UserClaims,
  input: CreateOrderInput,
  { createdAt = new Date() }: { createdAt?: Date } = {},
) {
  // shortcut: 8 hex characters, a clash fails on the unique reference constraint, upgrade to a retry if clashes become common
  const reference = `DEV-${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
  try {
    const [order] = await withUser(db, user, async (tx) => {
      // shortcut: count then insert is not atomic, so parallel requests can each pass the cap by a few; upgrade to a lock if that matters
      const [counted] = await tx
        .select({ recent: count() })
        .from(orders)
        .where(
          and(eq(orders.createdBy, user.sub), gt(orders.createdAt, new Date(Date.now() - HOUR))),
        );
      if (counted!.recent >= MAX_ORDERS_PER_HOUR) {
        throw new LimitReachedError(
          `Too many orders this hour (limit ${MAX_ORDERS_PER_HOUR}). Try again later.`,
        );
      }
      return tx.execute<{ id: string; reference: string }>(
        sql`select id, reference from public.create_order(
          ${input.storeId}::uuid, ${reference}, ${input.paymentMethod}, ${input.shippingCarrier},
          ${JSON.stringify(input.customer)}::jsonb, ${JSON.stringify(input.billingAddress)}::jsonb,
          ${JSON.stringify(input.shippingAddress)}::jsonb, ${JSON.stringify(input.lines)}::jsonb,
          ${createdAt.toISOString()}::timestamptz)`,
      );
    });
    if (!order) throw new Error("Order was not created");
    return order;
  } catch (error) {
    // The function raises these on purpose: P0002 for a store the user can't see, 42501 for no orders.create.
    const cause = pgError(error);
    if (cause?.code === "P0002") throw new StoreNotFoundError("Store not found");
    if (cause?.code === "42501") throw new OrderCreateForbiddenError("Forbidden");
    throw error;
  }
}

export function listStoresForOrder(db: Database, user: UserClaims) {
  return withUser(db, user, (tx) =>
    tx
      .select({
        id: stores.id,
        name: stores.name,
        market: stores.market,
        currency: stores.currency,
        status: stores.status,
        organizationName: organizations.name,
      })
      .from(stores)
      .innerJoin(organizations, eq(organizations.id, stores.organizationId))
      .orderBy(asc(stores.name)),
  );
}

export async function getOrder(db: Database, user: UserClaims, id: string) {
  if (!isUuid(id)) return null;

  return withUser(db, user, async (tx) => {
    const [row] = await tx
      .select({ order: orders, storeName: stores.name })
      .from(orders)
      .innerJoin(stores, eq(stores.id, orders.storeId))
      .where(eq(orders.id, id));
    if (!row) return null;

    const lines = await tx
      .select({
        position: orderLines.position,
        type: orderLines.type,
        sku: orderLines.sku,
        name: orderLines.name,
        quantity: orderLines.quantity,
        unitPrice: orderLines.unitPrice,
        taxRate: orderLines.taxRate,
        totalAmount: orderLines.totalAmount,
        totalTaxAmount: orderLines.totalTaxAmount,
      })
      .from(orderLines)
      .where(eq(orderLines.orderId, id))
      .orderBy(asc(orderLines.position));

    const addresses = await tx
      .select({
        kind: orderAddresses.kind,
        firstName: orderAddresses.firstName,
        lastName: orderAddresses.lastName,
        company: orderAddresses.company,
        streetAddress: orderAddresses.streetAddress,
        streetAddress2: orderAddresses.streetAddress2,
        postalCode: orderAddresses.postalCode,
        city: orderAddresses.city,
        region: orderAddresses.region,
        country: orderAddresses.country,
        phone: orderAddresses.phone,
      })
      .from(orderAddresses)
      .where(eq(orderAddresses.orderId, id))
      .orderBy(asc(orderAddresses.kind));

    const events = await tx
      .select({
        id: orderEvents.id,
        occurredAt: orderEvents.occurredAt,
        action: orderEvents.action,
        actorName: orderEvents.actorName,
        metadata: orderEvents.metadata,
      })
      .from(orderEvents)
      .where(eq(orderEvents.orderId, id))
      .orderBy(asc(orderEvents.occurredAt), asc(orderEvents.id));

    return {
      ...row.order,
      storeName: row.storeName,
      lines,
      addresses,
      // jsonb comes back untyped; only our own code writes it, in the shapes OrderEvent names.
      events: events as OrderEvent[],
    };
  });
}

// A capture, cancel or refund the database refused, with the HTTP status that fits.
export class OrderActionError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409,
  ) {
    super(message);
  }
}

// Postgres error codes that public.order_action() raises on purpose, and what they mean to a caller.
const ACTION_ERROR_STATUS: Record<string, OrderActionError["status"]> = {
  "22023": 400, // invalid_parameter_value: blank reason, amount not above 0
  "42501": 403, // insufficient_privilege: may read the order, but not do this
  P0002: 404, // no_data_found: missing, or not readable by this user
  "23514": 409, // check_violation: the order's status or amounts don't allow it
};

// Runs as the signed-in user. The database function checks the permission, changes the amounts
// and writes the timeline event in one transaction, so this only passes the input on.
export async function applyOrderAction(db: Database, user: UserClaims, input: OrderActionInput) {
  const amount = input.action === "cancel" ? null : input.amount;
  try {
    return await withUser(db, user, async (tx) => {
      const [row] = await tx.execute<{
        status: OrderStatus;
        captured_amount: number;
        refunded_amount: number;
        uncaptured_amount: number;
      }>(
        // Raw SQL skips Drizzle's bigint mapping, and postgres-js returns bigint as text. float8
        // comes back as a number and holds every amount up to Number.MAX_SAFE_INTEGER exactly.
        sql`select status, captured_amount::float8, refunded_amount::float8, uncaptured_amount::float8
          from public.order_action(${input.orderId}::uuid, ${input.action}, ${amount}::bigint, ${input.reason}, ${input.agentRunId ?? null}::uuid)`,
      );
      if (!row) throw new Error("order_action returned no row");
      return {
        id: input.orderId,
        status: row.status,
        capturedAmount: row.captured_amount,
        refundedAmount: row.refunded_amount,
        uncapturedAmount: row.uncaptured_amount,
      };
    });
  } catch (error) {
    const cause = pgError(error);
    const status = cause?.code ? ACTION_ERROR_STATUS[cause.code] : undefined;
    if (status && cause?.message) throw new OrderActionError(cause.message, status);
    throw error;
  }
}
