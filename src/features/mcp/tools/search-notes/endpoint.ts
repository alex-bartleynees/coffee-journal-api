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
        "Lists or searches the authenticated user's brew tasting notes and notes attached to beans, recipes, grinders, machines, and methods. Omit query to list all notes.",
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
          query: request.query ?? "",
          limit: request.limit ?? 10,
          entities: request.entities ?? AllNoteEntities,
          ...(request.cursor == null ? {} : { cursor: request.cursor }),
        }),
      );
      return {
        content: [{ type: "text", text: JSON.stringify(response) }],
        structuredContent: response,
      };
    },
  );
};
