import { Context, Data, Effect, Layer } from 'effect';
import postgres from 'postgres';
import { AppConfig } from './config.js';
import type { SyncRecord, SyncRequest, SyncResponse } from './schema.js';

export class DbError extends Data.TaggedError('DbError')<{ readonly cause: unknown }> {}

export interface DatabaseService {
	/**
	 * Run one push+pull cycle for a user in a single transaction:
	 * apply incoming changes under last-write-wins, return the server's version
	 * of any rejected (stale) change, then pull everything changed since `since`.
	 */
	readonly sync: (userId: string, req: SyncRequest) => Effect.Effect<SyncResponse, DbError>;
}

export class Database extends Context.Tag('Database')<Database, DatabaseService>() {}

type Row = {
	entity: SyncRecord['entity'];
	id: string;
	payload: unknown;
	updated_at: string; // bigint → string in the pg driver
	deleted: boolean;
	server_seq: string;
};

const rowToRecord = (r: Row): SyncRecord => ({
	entity: r.entity,
	id: r.id,
	updatedAt: Number(r.updated_at),
	deleted: r.deleted,
	payload: r.payload ?? null
});

/** Creates the schema (idempotent). server_seq comes from a global sequence —
 * strictly increasing, so it's a monotonic per-user pull cursor. */
const migrate = (sql: postgres.Sql) =>
	Effect.promise(async () => {
		await sql`CREATE SEQUENCE IF NOT EXISTS sync_seq`;
		await sql`
			CREATE TABLE IF NOT EXISTS sync_records (
				user_id    text   NOT NULL,
				entity     text   NOT NULL,
				id         text   NOT NULL,
				payload    jsonb,
				updated_at bigint NOT NULL,
				deleted    boolean NOT NULL DEFAULT false,
				server_seq bigint NOT NULL,
				PRIMARY KEY (user_id, entity, id)
			)`;
		await sql`CREATE INDEX IF NOT EXISTS sync_records_user_seq ON sync_records (user_id, server_seq)`;
	});

export const DatabaseLive = Layer.scoped(
	Database,
	Effect.gen(function* () {
		const url = yield* AppConfig.databaseUrl;
		const sql = yield* Effect.acquireRelease(
			Effect.sync(() => postgres(url)),
			(client) => Effect.promise(() => client.end())
		);
		yield* migrate(sql);

		const sync: DatabaseService['sync'] = (userId, req) =>
			Effect.tryPromise({
				try: () =>
					sql.begin(async (tx) => {
						const applied: string[] = [];
						const rejectedRefs: { entity: string; id: string }[] = [];

						for (const rec of req.changes) {
							// LWW upsert: the WHERE means an existing row only updates when the
							// incoming edit is strictly newer. No returned id ⇒ rejected (stale).
							const rows = await tx`
								INSERT INTO sync_records AS sr
									(user_id, entity, id, payload, updated_at, deleted, server_seq)
								VALUES (
									${userId}, ${rec.entity}, ${rec.id},
									${rec.payload === null ? null : tx.json(rec.payload as postgres.JSONValue)},
									${rec.updatedAt}, ${rec.deleted}, nextval('sync_seq')
								)
								ON CONFLICT (user_id, entity, id) DO UPDATE
									SET payload = excluded.payload,
										updated_at = excluded.updated_at,
										deleted = excluded.deleted,
										server_seq = excluded.server_seq
									WHERE excluded.updated_at > sr.updated_at
								RETURNING id`;
							if (rows.length > 0) applied.push(rec.id);
							else rejectedRefs.push({ entity: rec.entity, id: rec.id });
						}

						// Hand back the server's current version of each rejected change so
						// the client overwrites its stale local copy and converges.
						const rejected: SyncRecord[] = [];
						for (const ref of rejectedRefs) {
							const cur = await tx<Row[]>`
								SELECT entity, id, payload, updated_at, deleted, server_seq
								FROM sync_records
								WHERE user_id = ${userId} AND entity = ${ref.entity} AND id = ${ref.id}`;
							if (cur.length > 0) rejected.push(rowToRecord(cur[0]!));
						}

						// Pull: everything past the client's cursor (includes just-applied rows).
						const changeRows = await tx<Row[]>`
							SELECT entity, id, payload, updated_at, deleted, server_seq
							FROM sync_records
							WHERE user_id = ${userId} AND server_seq > ${req.since}
							ORDER BY server_seq ASC`;
						const changes = changeRows.map(rowToRecord);
						const cursor = changeRows.reduce(
							(max, r) => Math.max(max, Number(r.server_seq)),
							req.since
						);

						return { applied, rejected, changes, cursor } satisfies SyncResponse;
					}) as Promise<SyncResponse>,
				catch: (cause) => new DbError({ cause })
			});

		return { sync };
	})
);
