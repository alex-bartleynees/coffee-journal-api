import { Schema } from 'effect';

/**
 * Wire contracts for the sync protocol — shared shape between the SvelteKit
 * client and this service. See [[Sync-Protocol]] in the project wiki.
 *
 * The wire uses camelCase (`updatedAt`) since both ends are TypeScript. The
 * server never interprets `payload` — it's the full record body (a grinder
 * carries its presets inside it) stored verbatim as jsonb and handed back on
 * pull. Conflict resolution is per-record last-write-wins on `updatedAt`.
 */

export const Entity = Schema.Literal('bean', 'grinder', 'brew');
export type Entity = typeof Entity.Type;

export const SyncRecord = Schema.Struct({
	entity: Entity,
	id: Schema.String,
	/** Client wall-clock epoch-ms of the last edit; the LWW key. */
	updatedAt: Schema.Number,
	deleted: Schema.Boolean,
	/** Full record body, opaque to the server. Null for a pure tombstone. */
	payload: Schema.NullOr(Schema.Unknown)
});
export type SyncRecord = typeof SyncRecord.Type;

export const SyncRequest = Schema.Struct({
	/** Highest server_seq the client has already seen (0 = full pull). */
	since: Schema.Number,
	/** Locally-changed records the client is pushing (upserts + tombstones). */
	changes: Schema.Array(SyncRecord)
});
export type SyncRequest = typeof SyncRequest.Type;

export const SyncResponse = Schema.Struct({
	/** Ids the server accepted from `changes` — client clears their dirty flag. */
	applied: Schema.Array(Schema.String),
	/** Records where the server had a newer version — client adopts these. */
	rejected: Schema.Array(SyncRecord),
	/** Server records with server_seq > since (includes the just-applied ones). */
	changes: Schema.Array(SyncRecord),
	/** New high-water server_seq; the client stores this as its next `since`. */
	cursor: Schema.Number
});
export type SyncResponse = typeof SyncResponse.Type;
