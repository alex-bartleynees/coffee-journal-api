import type { McpServer } from "@modelcontextprotocol/server";
import { Effect } from "effect";
import { listBrews } from "../../../journal-read/list-brews.js";
import type { JournalReadRepositoryService } from "../../../journal-read/repository.js";
import { ListBrewsRequest } from "./request.js";
import { ListBrewsResponse } from "./response.js";

interface ListBrewsDependencies {
  readonly listBrews: JournalReadRepositoryService["listBrews"];
}

export const registerListBrewsEndpoint = (
  server: McpServer,
  userId: string,
  dependencies: ListBrewsDependencies,
) => {
  server.registerTool(
    "coffee_journal_list_brews",
    {
      title: "List coffee journal brews",
      description:
        "Lists the authenticated user's coffee brews and tasting notes, newest first. Supports date, method, and minimum-rating filters. Method is a brewing method such as espresso or v60, not a drink such as Flat White; omit it or use all for every method.",
      inputSchema: ListBrewsRequest,
      outputSchema: ListBrewsResponse,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (request) => {
      const method =
        request.method?.toLocaleLowerCase() === "all"
          ? undefined
          : request.method;
      const response = await Effect.runPromise(
        listBrews(dependencies.listBrews, userId, {
          limit: request.limit ?? 20,
          ...(request.cursor == null ? {} : { cursor: request.cursor }),
          ...(request.from == null ? {} : { from: request.from }),
          ...(request.to == null ? {} : { to: request.to }),
          ...(method == null ? {} : { method }),
          ...(request.minimumRating == null
            ? {}
            : { minimumRating: request.minimumRating }),
          ...(request.beanId == null ? {} : { beanId: request.beanId }),
        }),
      );

      return {
        content: [{ type: "text", text: JSON.stringify(response) }],
        structuredContent: response,
      };
    },
  );
};
