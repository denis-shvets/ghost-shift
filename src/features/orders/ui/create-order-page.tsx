import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { type SyntheticEvent, useEffect, useState } from "react";

import { type CreateOrderInput, MAX_LINE_QUANTITY } from "../model/create-order-input";
import { PAYMENT_METHOD_LABELS } from "../model/order-labels";
import { formatMoney } from "../model/money";
import { lineTotal, orderTotal } from "../model/order-total";
import { catalogProducts, type SampleProduct } from "../model/store-catalogs";
import { createOrderFn, fetchStoresFn } from "../server/functions";
import type { listStoresForOrder } from "../server/orders-repository";
import { addressFromForm } from "./address-form";
import { registerWebMcpTools } from "./web-mcp-tools";

type StoreOption = Awaited<ReturnType<typeof listStoresForOrder>>[number];
type Line = SampleProduct & { quantity: number };

// Every section is a bordered fieldset. Fields sit in a two-column grid on wide screens, one column on phones.
const sectionClass = "grid gap-4 rounded border border-neutral-200 p-4 sm:grid-cols-2";
// Full-width item inside a section grid, such as a checkbox or a long select.
const wideClass = "sm:col-span-2";

// One address block. The prefix matches the names address-form.ts reads.
function AddressFields({ prefix, legend }: { prefix: "billing" | "shipping"; legend: string }) {
  const name = (field: string) => `${prefix}${field}`;
  return (
    <fieldset className={sectionClass}>
      <legend className="px-1 font-semibold">{legend}</legend>
      <label>
        First name <input name={name("FirstName")} required />
      </label>
      <label>
        Last name <input name={name("LastName")} required />
      </label>
      <label className={wideClass}>
        Company (optional) <input name={name("Company")} />
      </label>
      <label className={wideClass}>
        Street address <input name={name("StreetAddress")} required />
      </label>
      <label className={wideClass}>
        Street address 2 (optional) <input name={name("StreetAddress2")} />
      </label>
      <label>
        Postal code <input name={name("PostalCode")} required />
      </label>
      <label>
        City <input name={name("City")} required />
      </label>
      <label>
        Region (optional) <input name={name("Region")} />
      </label>
      <label>
        Country (2 letters){" "}
        <input name={name("Country")} required pattern="[A-Z]{2}" maxLength={2} />
      </label>
      <label>
        Phone (optional) <input name={name("Phone")} type="tel" />
      </label>
    </fieldset>
  );
}

// Structure only; the global base styles in src/styles/app.css style the form (ADR 0018).
export function CreateOrderPage({ stores }: { stores: StoreOption[] }) {
  const createOrderOnServer = useServerFn(createOrderFn);
  const navigate = useNavigate();

  const [storeId, setStoreId] = useState(stores[0]?.id ?? "");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [lines, setLines] = useState<Line[]>([]);
  const [message, setMessage] = useState("");
  const [billingSameAsShipping, setBillingSameAsShipping] = useState(true);

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
  // The same list, in the same order, the MCP tool uses.
  const products = catalogProducts(storeId);

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
    const shippingAddress = addressFromForm(form, "shipping");
    // When the box is checked the billing fields are not rendered, so shipping is the only address read.
    const billingAddress = billingSameAsShipping
      ? shippingAddress
      : addressFromForm(form, "billing");
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
          shipped: form.get("shipped") === "on",
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
      <p>Step 1 picks the products. Step 2 fills in the order. Everything here is test data.</p>

      <h2>1. Products</h2>
      <div className="overflow-x-auto">
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
            {products.map((product) => (
              <tr key={product.sku}>
                <td>{product.name}</td>
                <td>{product.sku}</td>
                <td>{product.type}</td>
                <td>{formatMoney(product.unitPrice, currency)}</td>
                <td>
                  <label>
                    <span className="sr-only">Quantity for {product.sku}</span>
                    <input
                      className="w-24"
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
      </div>

      <form onSubmit={onSubmit} className="mt-6 grid gap-6">
        <h2>2. Order</h2>

        <fieldset className={sectionClass}>
          <legend className="px-1 font-semibold">Store and customer</legend>
          <label className={wideClass}>
            Store{" "}
            <select
              name="storeId"
              value={storeId}
              onChange={(event) => {
                // Lines and quantities hold prices and SKUs of the old store's currency and catalog.
                setStoreId(event.target.value);
                setLines([]);
                setQuantities({});
                setMessage("");
              }}
              required
            >
              {stores.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name} ({option.currency})
                </option>
              ))}
            </select>
          </label>
          <label>
            First name <input name="firstName" required />
          </label>
          <label>
            Last name <input name="lastName" required />
          </label>
          <label>
            Email <input name="email" type="email" required />
          </label>
          <label>
            Phone (optional) <input name="phone" type="tel" />
          </label>
        </fieldset>

        <AddressFields prefix="shipping" legend="Shipping address" />

        <label className="flex flex-row items-center gap-2 text-sm font-normal">
          <input
            type="checkbox"
            checked={billingSameAsShipping}
            onChange={(event) => setBillingSameAsShipping(event.target.checked)}
          />
          Billing address same as shipping
        </label>
        {billingSameAsShipping ? null : <AddressFields prefix="billing" legend="Billing address" />}

        <fieldset className={sectionClass}>
          <legend className="px-1 font-semibold">Payment and delivery</legend>
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
          <label>
            Shipping carrier <input name="shippingCarrier" required />
          </label>
          <label className="flex flex-row items-center gap-2 text-sm font-normal sm:col-span-2">
            <input type="checkbox" name="shipped" /> Already shipped
          </label>
        </fieldset>

        <section className="grid gap-4">
          <h2>3. Lines</h2>
          {lines.length === 0 ? (
            <p>No lines yet. Add products in step 1.</p>
          ) : (
            <div className="overflow-x-auto">
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
            </div>
          )}
          <p className="text-right text-base font-semibold">
            Total: {formatMoney(orderTotal(lines), currency)}
          </p>
        </section>

        {message ? <p role="alert">{message}</p> : null}
        <div>
          <button type="submit" disabled={lines.length === 0 || !store}>
            Create order
          </button>
        </div>
      </form>
    </>
  );
}
