import { Schema } from "effect";

export const Entity = Schema.Literals([
  "bean",
  "grinder",
  "brew",
  "machine",
  "method",
  "recipe",
]);
export type Entity = typeof Entity.Type;

const Timestamp = Schema.Int.check(Schema.isGreaterThan(0));
const RecordId = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(128),
);

export const SyncRecord = Schema.Struct({
  entity: Entity,
  id: RecordId,
  updatedAt: Timestamp,
  deleted: Schema.Boolean,
  payload: Schema.NullOr(Schema.Unknown),
});
export type SyncRecord = typeof SyncRecord.Type;
