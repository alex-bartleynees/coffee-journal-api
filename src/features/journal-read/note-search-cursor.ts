import { Data, Effect, Schema } from "effect";
import { NoteEntity, type NoteSearchCursor } from "./model.js";

const CursorPayload = Schema.Struct({
  updatedAt: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  entity: NoteEntity,
  id: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(128)),
  filterKey: Schema.String,
});
type CursorPayload = typeof CursorPayload.Type;

const CursorFromJson = Schema.fromJsonString(CursorPayload);

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
  Schema.decodeUnknownEffect(CursorFromJson)(
    Buffer.from(cursor, "base64url").toString("utf8"),
  ).pipe(Effect.mapError(() => new InvalidNoteSearchCursor()));

