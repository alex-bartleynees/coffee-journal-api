import { Data, Effect, Schema } from "effect";
import type { BeanCursor } from "./model.js";

const CursorPayload = Schema.Struct({
  name: Schema.String,
  id: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(128)),
  filterKey: Schema.String,
});
type CursorPayload = typeof CursorPayload.Type;

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
  Effect.tryPromise({
    try: () =>
      Schema.decodeUnknownPromise(CursorPayload)(
        JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")),
      ),
    catch: () => new InvalidBeanCursor(),
  });

