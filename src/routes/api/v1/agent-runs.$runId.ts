import { createFileRoute } from "@tanstack/react-router";

import { agentRunEndInput, agentRunIdInput } from "~/features/agent-runs/model/agent-run-input";
import { endAgentRun } from "~/features/agent-runs/server/agent-runs-repository";
import { handleApiRequest, json } from "~/features/orders/server/api-request";

// End one of the signed-in user's runs. The body is empty, `{}` or `{ "summary": "..." }`. A run that isn't theirs is
// answered as missing, the same as one that doesn't exist.
export const Route = createFileRoute("/api/v1/agent-runs/$runId")({
  server: {
    handlers: {
      PATCH: ({ request, params }) =>
        handleApiRequest(async (db, user) => {
          const runId = agentRunIdInput.safeParse(params.runId);
          if (!runId.success) {
            return json({ error: "Invalid input", issues: runId.error.issues }, 400);
          }

          // The summary is optional, so an empty body counts as {}.
          const body = await request
            .text()
            .then((text) => (text.trim() ? JSON.parse(text) : {}))
            .catch(() => undefined);
          if (body === undefined) return json({ error: "Invalid JSON" }, 400);

          const input = agentRunEndInput.safeParse(body);
          if (!input.success) {
            return json({ error: "Invalid input", issues: input.error.issues }, 400);
          }

          const run = await endAgentRun(db, user, runId.data, input.data);
          if (run === "not_found") return json({ error: "Agent run not found" }, 404);
          if (run === "already_ended") return json({ error: "Agent run already ended" }, 409);
          return json(run);
        }),
    },
  },
});
