import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { invalidToken } from "./token-verifier.js";

const MCP_SERVER_NAME = "coffee-journal";
const MCP_SERVER_VERSION = "0.1.0";

export const createCoffeeJournalMcpHandler = () =>
  createMcpHandler(
    ({ authInfo }) => {
      if (authInfo == null) {
        throw invalidToken();
      }

      return new McpServer(
        { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
        {
          instructions:
            "Read-only access to the authenticated user's coffee journal.",
        },
      );
    },
    { legacy: "stateless", responseMode: "json" },
  );
