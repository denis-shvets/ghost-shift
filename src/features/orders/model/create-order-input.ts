import { z } from "zod";

import { orderTotal } from "./order-total";
import { PAYMENT_METHODS } from "./payment-methods";

// The most units one line may hold. The create page caps added quantities at the same value.
export const MAX_LINE_QUANTITY = 10000;

const orderLineInput = z
  .object({
    type: z.enum(["physical", "digital", "shipping_fee", "discount", "surcharge"]),
    sku: z.string().optional(),
    name: z.string().min(1),
    quantity: z.number().int().positive().max(MAX_LINE_QUANTITY),
    // Minor units (cents). Discounts are negative; the database check enforces the same rule.
    unitPrice: z.number().int().min(-10_000_000).max(10_000_000),
    // Basis points: 600 means 6%.
    taxRate: z.number().int().min(0).max(10000),
  })
  .superRefine((line, ctx) => {
    if (line.type === "discount" && line.unitPrice > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["unitPrice"],
        message: "A discount cannot be positive",
      });
    }
    if (line.type !== "discount" && line.unitPrice < 0) {
      ctx.addIssue({
        code: "custom",
        path: ["unitPrice"],
        message: "Only a discount can be negative",
      });
    }
  });

export const addressInput = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  company: z.string().min(1).optional(),
  streetAddress: z.string().min(1),
  streetAddress2: z.string().min(1).optional(),
  postalCode: z.string().min(1),
  city: z.string().min(1),
  region: z.string().min(1).optional(),
  // ISO 3166-1 alpha-2 country code, for example SE.
  country: z.string().regex(/^[A-Z]{2}$/),
  phone: z.string().min(1).optional(),
});

export type AddressInput = z.infer<typeof addressInput>;

// What a developer sends to create a test order. Later server code takes the currency from the store.
// Both addresses are required; the page copies billing into shipping when they are the same.
export const createOrderInput = z.object({
  storeId: z.uuid(),
  customer: z.object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    email: z.email(),
    phone: z.string().min(1).optional(),
  }),
  billingAddress: addressInput,
  shippingAddress: addressInput,
  paymentMethod: z.enum(PAYMENT_METHODS),
  shippingCarrier: z.string().min(1),
  lines: z
    .array(orderLineInput)
    .min(1)
    .max(50)
    // Discounts may lower the total to zero, not below; the database checks the same rule.
    .refine((lines) => orderTotal(lines) >= 0, { message: "The order total cannot be negative" }),
});

export type CreateOrderInput = z.infer<typeof createOrderInput>;
