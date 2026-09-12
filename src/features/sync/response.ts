import { Schema } from "effect";
import { SyncRecord } from "./model.js";

export const SyncResponse = Schema.Struct({
  applied: Schema.Array(Schema.String),
  rejected: Schema.Array(SyncRecord),
  changes: Schema.Array(SyncRecord),
  cursor: Schema.Number,
});
export type SyncResponse = typeof SyncResponse.Type;
