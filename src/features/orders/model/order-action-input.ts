import { z } from "zod";

const orderId = z.uuid();
// Minor units (cents). The database also refuses more than is left to capture or refund.
const amount = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
// Every change to money carries a reason; the database refuses a blank one too.
const reason = z.string().trim().min(1).max(500);
// The caller's open agent run, if they act inside one. The database checks it is theirs and still going.
const agentRunId = z.uuid().optional();

// Capture, cancel or refund one order. Shared by the server function, the developer API and the MCP tools.
export const orderActionInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("capture"), orderId, amount, reason, agentRunId }),
  z.object({ action: z.literal("refund"), orderId, amount, reason, agentRunId }),
  z.object({ action: z.literal("cancel"), orderId, reason, agentRunId }),
]);

export type OrderActionInput = z.infer<typeof orderActionInput>;
export type OrderAction = OrderActionInput["action"];

const TOOL_DESCRIPTIONS: Record<OrderAction, string> = {
  capture:
    "Capture money from an order's authorization, in minor units (cents). Capture part now and the rest later, up to the uncaptured amount, before the authorization expires. A reason is required.",
  refund:
    "Refund captured money on an order, in minor units (cents), up to what was captured and not yet refunded. A reason is required.",
  cancel:
    "Cancel what is left of an order's authorization, so it can no longer be captured. Money already captured stays captured. A reason is required.",
};

// The capture_order, refund_order and cancel_order tools, shared by MCP and WebMCP, one per
// variant above. Their input leaves out `action`; the tool adds it back before calling the server.
// It also leaves out `agentRunId`: no tool starts or ends a run, so a tool caller has no run id to send.
export const ORDER_ACTION_TOOLS = orderActionInput.options.map((option) => {
  const { action, agentRunId: _agentRunId, ...shape } = option.shape;
  return {
    name: `${action.value}_order`,
    action: action.value,
    description: TOOL_DESCRIPTIONS[action.value],
    input: z.object(shape),
  };
});
