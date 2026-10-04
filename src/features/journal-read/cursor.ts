import { Data, Effect, Schema } from "effect";
import type { BrewCursor } from "./model.js";

const CursorPayload = Schema.Struct({
  date: Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/)),
  time: Schema.String,
  id: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(128)),
  filterKey: Schema.String,
});
type CursorPayload = typeof CursorPayload.Type;

const CursorFromJson = Schema.fromJsonString(CursorPayload);

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
  Schema.decodeUnknownEffect(CursorFromJson)(
    Buffer.from(cursor, "base64url").toString("utf8"),
  ).pipe(Effect.mapError(() => new InvalidJournalCursor()));
