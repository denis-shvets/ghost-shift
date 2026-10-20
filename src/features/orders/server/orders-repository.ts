import { asc, desc, eq, sql } from "drizzle-orm";

import { organizations } from "~/features/organizations/db/schema";
import { stores } from "~/features/stores/db/schema";
import type { UserClaims } from "~/shared/auth/user-claims";
import { type Database, withUser } from "~/shared/db/client";
import { isUuid } from "~/shared/ids/is-uuid";

import { orderAddresses, orderEvents, orderLines, orders } from "../db/schema";
import type { CreateOrderInput } from "../model/create-order-input";
import type { OrderActionInput } from "../model/order-action-input";
import type { OrderEvent, OrderEventMetadata } from "../model/order-event";
import type { OrderListInput } from "../model/order-list-input";
import type { OrderStatus } from "../model/order-statuses";
import { orderTotal } from "../model/order-total";
import { authorizationExpiresAt } from "../model/payment-methods";

// Runs as the signed-in user, so row-level security decides what they can read.
// Pages are ordered by (created_at, id), so orders with the same time can't be skipped.
// The cursor is an order id: the anchor's created_at and id are looked up in the same query.
export function listOrders(
  db: Database,
  user: UserClaims,
  { limit, cursor, direction }: OrderListInput,
) {
  return withUser(db, user, async (tx) => {
    // "prev" reads the orders newer than the cursor. Without a cursor there is nothing to go back from.
    const newer = direction === "prev" && cursor !== undefined;
    const anchor = sql`(select ${orders.createdAt}, ${orders.id} from ${orders} where ${orders.id} = ${cursor})`;
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
      })
      .from(orders)
      .where(
        cursor
          ? sql`(${orders.createdAt}, ${orders.id}) ${sql.raw(newer ? ">" : "<")} ${anchor}`
          : undefined,
      )
      .orderBy(
        newer ? asc(orders.createdAt) : desc(orders.createdAt),
        newer ? asc(orders.id) : desc(orders.id),
      )
      // One extra row tells us whether another page exists in this direction.
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    // Going back, the nearest rows came first, so flip them to newest first.
    if (newer) page.reverse();
    const first = page.at(0);
    const last = page.at(-1);
    return {
      orders: page,
      // Going forward, "older" exists only if there is an extra row. Going back, it always
      // exists, because the cursor order is older than this page.
      nextCursor: (newer || hasMore) && last ? last.id : null,
      // Going back, "newer" exists only if there is an extra row. Going forward with a
      // cursor, it always exists, because the cursor order is newer than this page.
      prevCursor: (newer ? hasMore : cursor !== undefined) && first ? first.id : null,
    };
  });
}

// A cursor the user can't see gives an empty page with no links, so fall back to the first page.
// shortcut: one extra query only when the cursor is invisible, upgrade if that path gets hot
export async function listOrdersOrFirstPage(db: Database, user: UserClaims, input: OrderListInput) {
  const page = await listOrders(db, user, input);
  if (page.orders.length > 0 || input.cursor === undefined) return page;
  return listOrders(db, user, { limit: input.limit });
}

// Thrown when the store is missing or not visible to the user (RLS hides it the same way).
export class StoreNotFoundError extends Error {}

// Thrown when the user can see the store but may not create orders in it (no orders.create).
export class OrderCreateForbiddenError extends Error {}

// Runs as the signed-in user. Stores they can't read are hidden, so the lookup fails the same way.
export function createOrder(db: Database, user: UserClaims, input: CreateOrderInput) {
  return withUser(db, user, async (tx) => {
    // Ask the same function the insert policy uses, so a refusal is a clear 403, not a raw 42501.
    // The policy still guards the insert on its own.
    const [store] = await tx
      .select({
        id: stores.id,
        currency: stores.currency,
        canCreate: sql<boolean>`public.has_permission('orders.create', ${stores.id})`,
      })
      .from(stores)
      .where(eq(stores.id, input.storeId));
    if (!store) throw new StoreNotFoundError("Store not found");
    if (!store.canCreate) throw new OrderCreateForbiddenError("Forbidden");

    const totalAmount = orderTotal(input.lines);
    // shortcut: 8 hex characters, a clash fails on the unique reference constraint, upgrade to a retry if clashes become common
    const reference = `DEV-${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;

    const createdAt = new Date();
    // The currency comes from the store, never from the request.
    const [order] = await tx
      .insert(orders)
      .values({
        reference,
        createdAt,
        expiresAt: authorizationExpiresAt(createdAt, input.paymentMethod),
        storeId: store.id,
        currency: store.currency,
        customerFirstName: input.customer.firstName,
        customerLastName: input.customer.lastName,
        customerEmail: input.customer.email,
        customerPhone: input.customer.phone,
        paymentMethod: input.paymentMethod,
        status: "authorized",
        totalAmount,
        capturedAmount: 0,
        refundedAmount: 0,
        shippingCarrier: input.shippingCarrier,
      })
      .returning({ id: orders.id, reference: orders.reference });
    if (!order) throw new Error("Order was not created");

    // total_amount and total_tax_amount on lines are generated by the database, so they are not sent.
    await tx.insert(orderLines).values(
      input.lines.map((line, index) => ({
        orderId: order.id,
        position: index + 1,
        type: line.type,
        sku: line.sku,
        name: line.name,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        taxRate: line.taxRate,
      })),
    );

    await tx.insert(orderAddresses).values([
      { orderId: order.id, kind: "billing", ...input.billingAddress },
      { orderId: order.id, kind: "shipping", ...input.shippingAddress },
    ]);

    const metadata: OrderEventMetadata<"authorized"> = { amount: totalAmount };
    await tx.insert(orderEvents).values({
      orderId: order.id,
      // The order's own time, so the timeline starts exactly when the order was created.
      occurredAt: createdAt,
      action: "authorized",
      actorUserId: user.sub,
      // The provider authorizes, as in the seed. Not the email: merchants can read the timeline.
      actorName: "Phantom Checkout",
      metadata,
    });

    return order;
  });
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
          from public.order_action(${input.orderId}::uuid, ${input.action}, ${amount}::bigint, ${input.reason})`,
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
    // Drizzle wraps the Postgres error, so the code and message sit on its `cause`.
    const cause = (error as { cause?: { code?: string; message?: string } }).cause;
    const status = cause?.code ? ACTION_ERROR_STATUS[cause.code] : undefined;
    if (status && cause?.message) throw new OrderActionError(cause.message, status);
    throw error;
  }
}
