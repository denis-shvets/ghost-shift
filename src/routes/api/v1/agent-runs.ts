import { createFileRoute } from "@tanstack/react-router";

import { agentRunStartInput } from "~/features/agent-runs/model/agent-run-input";
import { startAgentRun } from "~/features/agent-runs/server/agent-runs-repository";
import { handleApiRequest, json } from "~/features/orders/server/api-request";

// Start an agent run for the signed-in user. Send its id as `agentRunId` with each order action.
export const Route = createFileRoute("/api/v1/agent-runs")({
  server: {
    handlers: {
      POST: ({ request }) =>
        handleApiRequest(async (db, user) => {
          const body = await request.json().catch(() => undefined);
          if (body === undefined) return json({ error: "Invalid JSON" }, 400);

          const input = agentRunStartInput.safeParse(body);
          if (!input.success) {
            return json({ error: "Invalid input", issues: input.error.issues }, 400);
          }

          return json(await startAgentRun(db, user, input.data), 201);
        }),
    },
  },
});
