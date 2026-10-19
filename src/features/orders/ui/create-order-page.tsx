import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { type SyntheticEvent, useEffect, useState } from "react";

import { type CreateOrderInput, MAX_LINE_QUANTITY } from "../model/create-order-input";
import { PAYMENT_METHOD_LABELS } from "../model/order-labels";
import { formatMoney } from "../model/money";
import { lineTotal, orderTotal } from "../model/order-total";
import { SAMPLE_PRODUCTS, type SampleProduct } from "../model/sample-products";
import { createOrderFn, fetchStoresFn } from "../server/functions";
import type { listStoresForOrder } from "../server/orders-repository";
import { addressFromForm } from "./address-form";
import { registerWebMcpTools } from "./web-mcp-tools";

type StoreOption = Awaited<ReturnType<typeof listStoresForOrder>>[number];
type Line = SampleProduct & { quantity: number };

// One address block. The prefix matches the names address-form.ts reads.
function AddressFields({ prefix, legend }: { prefix: "billing" | "shipping"; legend: string }) {
  const name = (field: string) => `${prefix}${field}`;
  return (
    <fieldset>
      <legend>{legend}</legend>
      <p>
        <label>
          First name <input name={name("FirstName")} required />
        </label>
      </p>
      <p>
        <label>
          Last name <input name={name("LastName")} required />
        </label>
      </p>
      <p>
        <label>
          Company (optional) <input name={name("Company")} />
        </label>
      </p>
      <p>
        <label>
          Street address <input name={name("StreetAddress")} required />
        </label>
      </p>
      <p>
        <label>
          Street address 2 (optional) <input name={name("StreetAddress2")} />
        </label>
      </p>
      <p>
        <label>
          Postal code <input name={name("PostalCode")} required />
        </label>
      </p>
      <p>
        <label>
          City <input name={name("City")} required />
        </label>
      </p>
      <p>
        <label>
          Region (optional) <input name={name("Region")} />
        </label>
      </p>
      <p>
        <label>
          Country (2 letters){" "}
          <input name={name("Country")} required pattern="[A-Z]{2}" maxLength={2} />
        </label>
      </p>
      <p>
        <label>
          Phone (optional) <input name={name("Phone")} type="tel" />
        </label>
      </p>
    </fieldset>
  );
}

// Plain HTML on purpose: no design system yet (ADR 0014).
export function CreateOrderPage({ stores }: { stores: StoreOption[] }) {
  const createOrderOnServer = useServerFn(createOrderFn);
  const navigate = useNavigate();

  const [storeId, setStoreId] = useState(stores[0]?.id ?? "");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [lines, setLines] = useState<Line[]>([]);
  const [message, setMessage] = useState("");
  const [sameAsBilling, setSameAsBilling] = useState(true);

  // WebMCP tools exist only while this page is open and the browser supports them.
  useEffect(
    () =>
      registerWebMcpTools({
        listStores: () => fetchStoresFn(),
        // Called directly, not through useServerFn: a sign-in redirect then comes back to the agent
        // as an error instead of resolving undefined and moving the page to /login.
        createOrder: (data) => createOrderFn({ data }),
      }),
    [],
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
    const billingAddress = addressFromForm(form, "billing");
    // When the box is checked the shipping fields are not rendered, so billing is the only address read.
    const shippingAddress = sameAsBilling ? billingAddress : addressFromForm(form, "shipping");
    try {
      const order = await createOrderOnServer({
        data: {
          storeId,
          customer: {
            firstName: String(form.get("firstName")),
            lastName: String(form.get("lastName")),
            email: String(form.get("email")),
            phone: String(form.get("phone")) || undefined,
          },
          billingAddress,
          shippingAddress,
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
      // useServerFn resolves undefined when the session expired; it is already navigating to /login.
      if (!order) return;
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
            First name <input name="firstName" required />
          </label>
        </p>
        <p>
          <label>
            Last name <input name="lastName" required />
          </label>
        </p>
        <p>
          <label>
            Email <input name="email" type="email" required />
          </label>
        </p>
        <p>
          <label>
            Phone (optional) <input name="phone" type="tel" />
          </label>
        </p>
        <AddressFields prefix="billing" legend="Billing address" />
        <p>
          <label>
            <input
              type="checkbox"
              checked={sameAsBilling}
              onChange={(event) => setSameAsBilling(event.target.checked)}
            />{" "}
            Shipping address same as billing
          </label>
        </p>
        {sameAsBilling ? null : <AddressFields prefix="shipping" legend="Shipping address" />}
        <p>
          <label>
            Payment method{" "}
            <select name="paymentMethod" defaultValue="card">
              {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
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
