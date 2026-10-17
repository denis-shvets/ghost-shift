import { z } from "zod";

// What a caller may send as an order id. Shape is checked later by getOrder,
// so a malformed id becomes "not found" instead of an error.
export const orderIdInput = z.string().min(1).max(100);
