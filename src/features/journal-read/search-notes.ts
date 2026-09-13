import { Effect } from "effect";
import type { DbError } from "../../shared/persistence/errors.js";
import type { NoteEntity, NoteSearchResult } from "./model.js";
import {
  decodeNoteSearchCursor,
  encodeNoteSearchCursor,
  InvalidNoteSearchCursor,
} from "./note-search-cursor.js";
import type { JournalReadRepositoryService } from "./repository.js";

export interface SearchNotesInput {
  readonly query: string;
  readonly entities: readonly NoteEntity[];
  readonly limit: number;
  readonly cursor?: string | undefined;
}

export interface SearchNotesResult {
  readonly results: readonly NoteSearchResult[];
  readonly nextCursor?: string;
}

const MAX_PAGE_SIZE = 25;
const filterKey = (input: SearchNotesInput) =>
  JSON.stringify([input.query.toLocaleLowerCase(), [...input.entities].sort()]);

export const searchNotes = (
  repository: JournalReadRepositoryService["searchNotes"],
  userId: string,
  input: SearchNotesInput,
): Effect.Effect<SearchNotesResult, DbError | InvalidNoteSearchCursor> =>
  Effect.gen(function* () {
    const activeFilterKey = filterKey(input);
    const decodedCursor =
      input.cursor == null
        ? undefined
        : yield* decodeNoteSearchCursor(input.cursor);
    if (
      decodedCursor !== undefined &&
      decodedCursor.filterKey !== activeFilterKey
    ) {
      return yield* new InvalidNoteSearchCursor();
    }

    const page = yield* repository(userId, {
      query: input.query,
      entities: input.entities,
      limit: Math.max(1, Math.min(input.limit, MAX_PAGE_SIZE)),
      ...(decodedCursor === undefined
        ? {}
        : {
            cursor: {
              updatedAt: decodedCursor.updatedAt,
              entity: decodedCursor.entity,
              id: decodedCursor.id,
            },
          }),
    });

    return {
      results: page.results,
      ...(page.nextCursor == null
        ? {}
        : {
            nextCursor: encodeNoteSearchCursor(
              page.nextCursor,
              activeFilterKey,
            ),
          }),
    };
  });

