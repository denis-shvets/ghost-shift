import { z } from "zod";

const orderLineInput = z
  .object({
    type: z.enum(["physical", "digital", "shipping_fee", "discount", "surcharge"]),
    sku: z.string().optional(),
    name: z.string().min(1),
    quantity: z.number().int().positive(),
    // Minor units (cents). Discounts are negative; the database check enforces the same rule.
    unitPrice: z.number().int(),
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

// What a developer sends to create a test order. Later server code takes the currency from the store.
export const createOrderInput = z.object({
  storeId: z.uuid(),
  shopper: z.object({
    name: z.string().min(1),
    email: z.email(),
    country: z.string().regex(/^[A-Z]{2}$/),
  }),
  paymentMethod: z.enum(["card", "invoice", "wallet", "bank_transfer"]),
  shippingCarrier: z.string().min(1),
  lines: z.array(orderLineInput).min(1).max(50),
});

export type CreateOrderInput = z.infer<typeof createOrderInput>;
