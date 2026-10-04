import { Data, Effect, Schema } from "effect";
import type { BeanCursor } from "./model.js";

const CursorPayload = Schema.Struct({
  name: Schema.String,
  id: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(128)),
  filterKey: Schema.String,
});
type CursorPayload = typeof CursorPayload.Type;

const CursorFromJson = Schema.fromJsonString(CursorPayload);

export class InvalidBeanCursor extends Data.TaggedError("InvalidBeanCursor") {}

export const encodeBeanCursor = (
  cursor: BeanCursor,
  filterKey: string,
): string =>
  Buffer.from(JSON.stringify({ ...cursor, filterKey }), "utf8").toString(
    "base64url",
  );

export const decodeBeanCursor = (
  cursor: string,
): Effect.Effect<CursorPayload, InvalidBeanCursor> =>
  Schema.decodeUnknownEffect(CursorFromJson)(
    Buffer.from(cursor, "base64url").toString("utf8"),
  ).pipe(Effect.mapError(() => new InvalidBeanCursor()));

