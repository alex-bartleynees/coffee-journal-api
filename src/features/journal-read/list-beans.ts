import { Effect } from "effect";
import type { DbError } from "../../shared/persistence/errors.js";
import {
  decodeBeanCursor,
  encodeBeanCursor,
  InvalidBeanCursor,
} from "./bean-cursor.js";
import type { StoredBean } from "./model.js";
import type { JournalReadRepositoryService } from "./repository.js";

export interface ListBeansInput {
  readonly limit: number;
  readonly cursor?: string | undefined;
  readonly status: "active" | "finished" | "all";
  readonly roaster?: string | undefined;
}

export interface ListBeansResult {
  readonly beans: readonly StoredBean[];
  readonly nextCursor?: string;
}

const MAX_PAGE_SIZE = 50;
const filterKey = (input: ListBeansInput) =>
  JSON.stringify([input.status, input.roaster ?? null]);

export const listBeans = (
  repository: JournalReadRepositoryService["listBeans"],
  userId: string,
  input: ListBeansInput,
): Effect.Effect<ListBeansResult, DbError | InvalidBeanCursor> =>
  Effect.gen(function* () {
    const activeFilterKey = filterKey(input);
    const decodedCursor =
      input.cursor == null ? undefined : yield* decodeBeanCursor(input.cursor);
    if (
      decodedCursor !== undefined &&
      decodedCursor.filterKey !== activeFilterKey
    ) {
      return yield* new InvalidBeanCursor();
    }

    const page = yield* repository(userId, {
      limit: Math.max(1, Math.min(input.limit, MAX_PAGE_SIZE)),
      status: input.status,
      ...(input.roaster === undefined ? {} : { roaster: input.roaster }),
      ...(decodedCursor === undefined
        ? {}
        : {
            cursor: {
              name: decodedCursor.name,
              id: decodedCursor.id,
            },
          }),
    });

    return {
      beans: page.beans,
      ...(page.nextCursor == null
        ? {}
        : {
            nextCursor: encodeBeanCursor(page.nextCursor, activeFilterKey),
          }),
    };
  });

