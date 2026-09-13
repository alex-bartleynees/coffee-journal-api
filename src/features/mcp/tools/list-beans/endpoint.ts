import type { McpServer } from "@modelcontextprotocol/server";
import { Effect } from "effect";
import { listBeans } from "../../../journal-read/list-beans.js";
import type { JournalReadRepositoryService } from "../../../journal-read/repository.js";
import { ListBeansRequest } from "./request.js";
import { ListBeansResponse } from "./response.js";

interface ListBeansDependencies {
  readonly listBeans: JournalReadRepositoryService["listBeans"];
}

export const registerListBeansEndpoint = (
  server: McpServer,
  userId: string,
  dependencies: ListBeansDependencies,
) => {
  server.registerTool(
    "coffee_journal_list_beans",
    {
      title: "List coffee beans",
      description:
        "Lists the authenticated user's coffee beans, optionally filtered by active/finished status and roaster.",
      inputSchema: ListBeansRequest,
      outputSchema: ListBeansResponse,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (request) => {
      const response = await Effect.runPromise(
        listBeans(dependencies.listBeans, userId, {
          limit: request.limit,
          status: request.status,
          ...(request.cursor == null ? {} : { cursor: request.cursor }),
          ...(request.roaster == null ? {} : { roaster: request.roaster }),
        }),
      );
      return {
        content: [{ type: "text", text: JSON.stringify(response) }],
        structuredContent: response,
      };
    },
  );
};
