import { z } from "zod";

// What the agent is about to do, for example "Capture shipped orders". The database allows 200 characters.
export const agentRunStartInput = z.object({ purpose: z.string().trim().min(1).max(200) });

// What the agent says it did. Optional: a run can end without one.
export const agentRunEndInput = z.object({
  summary: z.string().trim().min(1).max(2000).optional(),
});

export const agentRunIdInput = z.uuid();

export type AgentRunStartInput = z.infer<typeof agentRunStartInput>;
export type AgentRunEndInput = z.infer<typeof agentRunEndInput>;
