import { Data, Effect, Schema } from "effect";
import { NoteEntity, type NoteSearchCursor } from "./model.js";

const CursorPayload = Schema.Struct({
  updatedAt: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  entity: NoteEntity,
  id: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(128)),
  filterKey: Schema.String,
});
type CursorPayload = typeof CursorPayload.Type;

export class InvalidNoteSearchCursor extends Data.TaggedError(
  "InvalidNoteSearchCursor",
) {}

export const encodeNoteSearchCursor = (
  cursor: NoteSearchCursor,
  filterKey: string,
): string =>
  Buffer.from(JSON.stringify({ ...cursor, filterKey }), "utf8").toString(
    "base64url",
  );

export const decodeNoteSearchCursor = (
  cursor: string,
): Effect.Effect<CursorPayload, InvalidNoteSearchCursor> =>
  Effect.tryPromise({
    try: () =>
      Schema.decodeUnknownPromise(CursorPayload)(
        JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")),
      ),
    catch: () => new InvalidNoteSearchCursor(),
  });

