import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import type { JournalReadRepositoryService } from "../journal-read/repository.js";
import { registerGetBrewEndpoint } from "./tools/get-brew/endpoint.js";
import { registerListBeansEndpoint } from "./tools/list-beans/endpoint.js";
import { registerJournalSummaryEndpoint } from "./tools/journal-summary/endpoint.js";
import { registerSearchNotesEndpoint } from "./tools/search-notes/endpoint.js";
import { registerListBrewsEndpoint } from "./tools/list-brews/endpoint.js";
import { invalidToken } from "./token-verifier.js";

const MCP_SERVER_NAME = "coffee-journal";
const MCP_SERVER_VERSION = "0.1.0";

interface CoffeeJournalMcpDependencies {
  readonly listBrews: JournalReadRepositoryService["listBrews"];
  readonly getBrew: JournalReadRepositoryService["getBrew"];
  readonly listBeans: JournalReadRepositoryService["listBeans"];
  readonly getSummary: JournalReadRepositoryService["getSummary"];
  readonly searchNotes: JournalReadRepositoryService["searchNotes"];
}

export const createCoffeeJournalMcpHandler = (
  dependencies: CoffeeJournalMcpDependencies,
) =>
  createMcpHandler(
    ({ authInfo }) => {
      if (authInfo == null) {
        throw invalidToken();
      }

      const server = new McpServer(
        { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
        {
          instructions:
            "Read-only access to the authenticated user's coffee journal.",
        },
      );

      const userId = authInfo.extra?.userId;
      if (typeof userId !== "string") {
        throw invalidToken();
      }

      registerListBrewsEndpoint(server, userId, dependencies);
      registerGetBrewEndpoint(server, userId, dependencies);
      registerListBeansEndpoint(server, userId, dependencies);
      registerJournalSummaryEndpoint(server, userId, dependencies);
      registerSearchNotesEndpoint(server, userId, dependencies);

      return server;
    },
    { legacy: "stateless", responseMode: "json" },
  );
