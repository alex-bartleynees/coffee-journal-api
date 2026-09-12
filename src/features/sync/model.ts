import { Schema } from "effect";

export const Entity = Schema.Literal(
  "bean",
  "grinder",
  "brew",
  "machine",
  "method",
  "recipe",
);
export type Entity = typeof Entity.Type;

const Timestamp = Schema.Number.pipe(Schema.int(), Schema.positive());
const RecordId = Schema.String.pipe(
  Schema.minLength(1),
  Schema.maxLength(128),
);

export const SyncRecord = Schema.Struct({
  entity: Entity,
  id: RecordId,
  updatedAt: Timestamp,
  deleted: Schema.Boolean,
  payload: Schema.NullOr(Schema.Unknown),
});
export type SyncRecord = typeof SyncRecord.Type;
