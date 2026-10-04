import { Schema } from "effect";
import { SyncRecord } from "./model.js";

const Sequence = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

export const SyncRequest = Schema.Struct({
  since: Sequence,
  changes: Schema.Array(SyncRecord),
});
export type SyncRequest = typeof SyncRequest.Type;
