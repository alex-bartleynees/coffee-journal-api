import { Data, Effect, Schema } from "effect";
import type { BrewCursor } from "./model.js";

const CursorPayload = Schema.Struct({
  date: Schema.String.pipe(Schema.pattern(/^\d{4}-\d{2}-\d{2}$/)),
  time: Schema.String,
  id: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(128)),
  filterKey: Schema.String,
});
type CursorPayload = typeof CursorPayload.Type;

export class InvalidJournalCursor extends Data.TaggedError(
  "InvalidJournalCursor",
) {}

export const encodeBrewCursor = (
  cursor: BrewCursor,
  filterKey: string,
): string =>
  Buffer.from(JSON.stringify({ ...cursor, filterKey }), "utf8").toString(
    "base64url",
  );

export const decodeBrewCursor = (
  cursor: string,
): Effect.Effect<CursorPayload, InvalidJournalCursor> =>
  Effect.tryPromise({
    try: () =>
      Schema.decodeUnknownPromise(CursorPayload)(
        JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")),
      ),
    catch: () => new InvalidJournalCursor(),
  });
