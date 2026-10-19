import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { type SyntheticEvent, useEffect, useState } from "react";

import {
  type CreateOrderInput,
  MAX_LINE_QUANTITY,
} from "~/features/orders/model/create-order-input";
import { formatMoney } from "~/features/orders/model/money";
import { lineTotal, orderTotal } from "~/features/orders/model/order-total";
import { SAMPLE_PRODUCTS, type SampleProduct } from "~/features/orders/model/sample-products";
import { createOrderFn, fetchStoresFn } from "~/features/orders/server/functions";
import { registerWebMcpTools } from "~/features/orders/ui/web-mcp-tools";

type Line = SampleProduct & { quantity: number };

export const Route = createFileRoute("/developer/create-order")({
  loader: async () => {
    try {
      return { stores: await fetchStoresFn() };
    } catch (error) {
      // Signed-in users without the developer role get a 403 from the server; send them back to the list.
      if (error instanceof Response && error.status === 403) throw redirect({ to: "/orders" });
      throw error;
    }
  },
  component: CreateOrder,
});

// Plain HTML on purpose: no design system yet (ADR 0014).
function CreateOrder() {
  const { stores } = Route.useLoaderData();
  const createOrderOnServer = useServerFn(createOrderFn);
  const navigate = useNavigate();

  const [storeId, setStoreId] = useState(stores[0]?.id ?? "");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [lines, setLines] = useState<Line[]>([]);
  const [message, setMessage] = useState("");

  // WebMCP tools exist only while this page is open and the browser supports them.
  useEffect(
    () =>
      registerWebMcpTools({
        listStores: () => fetchStoresFn(),
        createOrder: (data) => createOrderOnServer({ data }),
      }),
    [createOrderOnServer],
  );

  const store = stores.find((candidate) => candidate.id === storeId);
  const currency = store?.currency ?? "";

  // Intl throws on an empty currency code, so nothing money-related renders without a store.
  if (stores.length === 0) {
    return (
      <>
        <h1>Create test order</h1>
        <p>No stores are visible to this account.</p>
      </>
    );
  }

  function addLine(product: SampleProduct) {
    const quantity = quantities[product.sku] ?? 1;
    // The number input still lets through 0, an empty field (Number("") is 0) and fractions.
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_LINE_QUANTITY) {
      setMessage(
        `Quantity for ${product.sku} must be a whole number from 1 to ${MAX_LINE_QUANTITY}.`,
      );
      return;
    }
    setMessage("");
    setLines((current) => {
      const existing = current.find((line) => line.sku === product.sku);
      if (!existing) return [...current, { ...product, quantity }];
      return current.map((line) =>
        line.sku === product.sku
          ? { ...line, quantity: Math.min(line.quantity + quantity, MAX_LINE_QUANTITY) }
          : line,
      );
    });
  }

  async function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setMessage("");
    try {
      const order = await createOrderOnServer({
        data: {
          storeId,
          shopper: {
            name: String(form.get("shopperName")),
            email: String(form.get("shopperEmail")),
            country: String(form.get("shopperCountry")),
          },
          // The server validates these values; the select only offers valid options.
          paymentMethod: String(form.get("paymentMethod")) as CreateOrderInput["paymentMethod"],
          shippingCarrier: String(form.get("shippingCarrier")),
          lines: lines.map(({ sku, name, type, unitPrice, taxRate, quantity }) => ({
            sku,
            name,
            type,
            unitPrice,
            taxRate,
            quantity,
          })),
        },
      });
      await navigate({ to: "/orders/$orderId", params: { orderId: order.id } });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create the order.");
    }
  }

  return (
    <>
      <h1>Create test order</h1>

      <h2>Products</h2>
      <table>
        <thead>
          <tr>
            <th>Product</th>
            <th>SKU</th>
            <th>Type</th>
            <th>Unit price</th>
            <th>Quantity</th>
            <th>Add</th>
          </tr>
        </thead>
        <tbody>
          {SAMPLE_PRODUCTS.map((product) => (
            <tr key={product.sku}>
              <td>{product.name}</td>
              <td>{product.sku}</td>
              <td>{product.type}</td>
              <td>{formatMoney(product.unitPrice, currency)}</td>
              <td>
                <label>
                  Quantity for {product.sku}{" "}
                  <input
                    type="number"
                    min={1}
                    max={MAX_LINE_QUANTITY}
                    step={1}
                    value={quantities[product.sku] ?? 1}
                    onChange={(event) =>
                      setQuantities((current) => ({
                        ...current,
                        [product.sku]: Number(event.target.value),
                      }))
                    }
                  />
                </label>
              </td>
              <td>
                <button type="button" onClick={() => addLine(product)} disabled={!currency}>
                  Add
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <form onSubmit={onSubmit}>
        <h2>Order</h2>
        <p>
          <label>
            Store{" "}
            <select
              name="storeId"
              value={storeId}
              onChange={(event) => setStoreId(event.target.value)}
              required
            >
              {stores.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name} ({option.currency})
                </option>
              ))}
            </select>
          </label>
        </p>
        <p>
          <label>
            Shopper name <input name="shopperName" required />
          </label>
        </p>
        <p>
          <label>
            Shopper email <input name="shopperEmail" type="email" required />
          </label>
        </p>
        <p>
          <label>
            Shopper country (2 letters){" "}
            <input name="shopperCountry" required pattern="[A-Z]{2}" maxLength={2} />
          </label>
        </p>
        <p>
          <label>
            Payment method{" "}
            <select name="paymentMethod" defaultValue="card">
              <option value="card">Card</option>
              <option value="invoice">Invoice</option>
              <option value="wallet">Wallet</option>
              <option value="bank_transfer">Bank transfer</option>
            </select>
          </label>
        </p>
        <p>
          <label>
            Shipping carrier <input name="shippingCarrier" required />
          </label>
        </p>

        <h2>Lines</h2>
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Type</th>
              <th>Quantity</th>
              <th>Unit price</th>
              <th>Line total</th>
              <th>Remove</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.sku}>
                <td>{line.name}</td>
                <td>{line.type}</td>
                <td>{line.quantity}</td>
                <td>{formatMoney(line.unitPrice, currency)}</td>
                <td>{formatMoney(lineTotal(line), currency)}</td>
                <td>
                  <button
                    type="button"
                    onClick={() =>
                      setLines((current) => current.filter((other) => other.sku !== line.sku))
                    }
                  >
                    Remove {line.sku}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>Total: {formatMoney(orderTotal(lines), currency)}</p>

        <p>
          <button type="submit" disabled={lines.length === 0 || !store}>
            Create order
          </button>
        </p>
        {message ? <p role="alert">{message}</p> : null}
      </form>
    </>
  );
}
