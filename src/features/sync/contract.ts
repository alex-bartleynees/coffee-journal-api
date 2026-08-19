import { Schema } from "effect";

/** The server stores record payloads opaquely and resolves conflicts per record. */
export const Entity = Schema.Literal(
  "bean",
  "grinder",
  "brew",
  "machine",
  "method",
  "recipe",
);
export type Entity = typeof Entity.Type;

export const SyncRecord = Schema.Struct({
  entity: Entity,
  id: Schema.String,
  /** Client wall-clock epoch milliseconds; strictly newer values win. */
  updatedAt: Schema.Number,
  deleted: Schema.Boolean,
  /** Full record body, opaque to the server. Null for a pure tombstone. */
  payload: Schema.NullOr(Schema.Unknown),
});
export type SyncRecord = typeof SyncRecord.Type;

export const SyncRequest = Schema.Struct({
  /** Highest server sequence already observed by this client. */
  since: Schema.Number,
  /** Locally changed upserts and tombstones. */
  changes: Schema.Array(SyncRecord),
});
export type SyncRequest = typeof SyncRequest.Type;

export const SyncResponse = Schema.Struct({
  applied: Schema.Array(Schema.String),
  rejected: Schema.Array(SyncRecord),
  changes: Schema.Array(SyncRecord),
  /** New high-water server sequence for the client's next request. */
  cursor: Schema.Number,
});
export type SyncResponse = typeof SyncResponse.Type;
