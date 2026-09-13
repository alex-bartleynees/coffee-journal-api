import type { McpServer } from "@modelcontextprotocol/server";
import { Effect } from "effect";
import type { JournalReadRepositoryService } from "../../../journal-read/repository.js";
import { GetBrewRequest } from "./request.js";
import { GetBrewResponse } from "./response.js";

interface GetBrewDependencies {
  readonly getBrew: JournalReadRepositoryService["getBrew"];
}

export const registerGetBrewEndpoint = (
  server: McpServer,
  userId: string,
  dependencies: GetBrewDependencies,
) => {
  server.registerTool(
    "coffee_journal_get_brew",
    {
      title: "Get coffee journal brew",
      description:
        "Gets one of the authenticated user's brews with its tasting details and related bean, method, grinder, machine, and recipe.",
      inputSchema: GetBrewRequest,
      outputSchema: GetBrewResponse,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (request) => {
      const response = {
        brew: await Effect.runPromise(
          dependencies.getBrew(userId, request.brewId),
        ),
      };

      return {
        content: [{ type: "text", text: JSON.stringify(response) }],
        structuredContent: response,
      };
    },
  );
};
