import type { McpServer } from "@modelcontextprotocol/server";
import { Effect } from "effect";
import { searchNotes } from "../../../journal-read/search-notes.js";
import type { JournalReadRepositoryService } from "../../../journal-read/repository.js";
import { AllNoteEntities, SearchNotesRequest } from "./request.js";
import { SearchNotesResponse } from "./response.js";

interface SearchNotesDependencies {
  readonly searchNotes: JournalReadRepositoryService["searchNotes"];
}

export const registerSearchNotesEndpoint = (
  server: McpServer,
  userId: string,
  dependencies: SearchNotesDependencies,
) => {
  server.registerTool(
    "coffee_journal_search_notes",
    {
      title: "Search coffee journal notes",
      description:
        "Searches the authenticated user's brew tasting notes and notes attached to beans, recipes, grinders, machines, and methods.",
      inputSchema: SearchNotesRequest,
      outputSchema: SearchNotesResponse,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (request) => {
      const response = await Effect.runPromise(
        searchNotes(dependencies.searchNotes, userId, {
          ...request,
          entities: request.entities ?? AllNoteEntities,
        }),
      );
      return {
        content: [{ type: "text", text: JSON.stringify(response) }],
        structuredContent: response,
      };
    },
  );
};

