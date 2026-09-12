import { Schema } from "effect";
import { SyncRecord } from "./model.js";

const Sequence = Schema.Number.pipe(Schema.int(), Schema.nonNegative());

export const SyncRequest = Schema.Struct({
  since: Sequence,
  changes: Schema.Array(SyncRecord),
});
export type SyncRequest = typeof SyncRequest.Type;
