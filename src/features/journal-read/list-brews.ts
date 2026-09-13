import { Effect } from "effect";
import type { DbError } from "../../shared/persistence/errors.js";
import {
  decodeBrewCursor,
  encodeBrewCursor,
  InvalidJournalCursor,
} from "./cursor.js";
import type { BrewSummary } from "./model.js";
import type { JournalReadRepositoryService } from "./repository.js";

export interface ListBrewsInput {
  readonly limit: number;
  readonly cursor?: string | undefined;
  readonly from?: string | undefined;
  readonly to?: string | undefined;
  readonly method?: string | undefined;
  readonly minimumRating?: number | undefined;
  readonly beanId?: string | undefined;
}

export interface ListBrewsResult {
  readonly brews: readonly BrewSummary[];
  readonly nextCursor?: string;
}

const MAX_PAGE_SIZE = 50;

const filterKey = (input: ListBrewsInput): string =>
  JSON.stringify([
    input.from ?? null,
    input.to ?? null,
    input.method ?? null,
    input.minimumRating ?? null,
    input.beanId ?? null,
  ]);

export const listBrews = (
  repository: JournalReadRepositoryService["listBrews"],
  userId: string,
  input: ListBrewsInput,
): Effect.Effect<ListBrewsResult, DbError | InvalidJournalCursor> =>
  Effect.gen(function* () {
    const activeFilterKey = filterKey(input);
    const decodedCursor =
      input.cursor == null ? undefined : yield* decodeBrewCursor(input.cursor);
    if (
      decodedCursor !== undefined &&
      decodedCursor.filterKey !== activeFilterKey
    ) {
      return yield* new InvalidJournalCursor();
    }

    const cursor =
      decodedCursor === undefined
        ? undefined
        : {
            date: decodedCursor.date,
            time: decodedCursor.time,
            id: decodedCursor.id,
          };
    const page = yield* repository(userId, {
      limit: Math.max(1, Math.min(input.limit, MAX_PAGE_SIZE)),
      ...(cursor === undefined ? {} : { cursor }),
      ...(input.from === undefined ? {} : { from: input.from }),
      ...(input.to === undefined ? {} : { to: input.to }),
      ...(input.method === undefined ? {} : { method: input.method }),
      ...(input.minimumRating === undefined
        ? {}
        : { minimumRating: input.minimumRating }),
      ...(input.beanId === undefined ? {} : { beanId: input.beanId }),
    });

    return {
      brews: page.brews,
      ...(page.nextCursor == null
        ? {}
        : {
            nextCursor: encodeBrewCursor(page.nextCursor, activeFilterKey),
          }),
    };
  });
