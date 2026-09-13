import type { McpServer } from "@modelcontextprotocol/server";
import { Effect } from "effect";
import type { JournalReadRepositoryService } from "../../../journal-read/repository.js";
import { JournalSummaryRequest } from "./request.js";
import { JournalSummaryResponse } from "./response.js";

interface JournalSummaryDependencies {
  readonly getSummary: JournalReadRepositoryService["getSummary"];
}

export const registerJournalSummaryEndpoint = (
  server: McpServer,
  userId: string,
  dependencies: JournalSummaryDependencies,
) => {
  server.registerTool(
    "coffee_journal_summary",
    {
      title: "Summarize coffee journal",
      description:
        "Summarizes the authenticated user's coffee brews, ratings, favourites, top methods, and top beans for an optional date range.",
      inputSchema: JournalSummaryRequest,
      outputSchema: JournalSummaryResponse,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (request) => {
      const summary = await Effect.runPromise(
        dependencies.getSummary(userId, {
          ...(request.from === undefined ? {} : { from: request.from }),
          ...(request.to === undefined ? {} : { to: request.to }),
        }),
      );
      const response = {
        period: {
          from: request.from ?? null,
          to: request.to ?? null,
        },
        ...summary,
      };
      return {
        content: [{ type: "text", text: JSON.stringify(response) }],
        structuredContent: response,
      };
    },
  );
};

