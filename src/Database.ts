import { Context, Data, Effect, Layer } from 'effect';
import postgres from 'postgres';
import { AppConfig } from './config.js';
import type { EntitlementEvent, SyncRecord, SyncRequest, SyncResponse } from './schema.js';

export class DbError extends Data.TaggedError('DbError')<{ readonly cause: unknown }> {}

export interface DatabaseService {
	/**
	 * Run one push+pull cycle for a user in a single transaction:
	 * apply incoming changes under last-write-wins, return the server's version
	 * of any rejected (stale) change, then pull everything changed since `since`.
	 */
	readonly sync: (userId: string, req: SyncRequest) => Effect.Effect<SyncResponse, DbError>;
	/**
	 * The entitlement gate read: whether the local read-model (fed by the
	 * Payments.Gateway RabbitMQ events) grants this user sync access.
	 * Fail-closed — no row means no access.
	 */
	readonly hasAccess: (userId: string) => Effect.Effect<boolean, DbError>;
	/**
	 * Register a verified Keycloak identity as a Bloom user on first authenticated
	 * app session. This is deliberately independent from payment and sync access.
	 */
	readonly registerUser: (userId: string, email: string | null) => Effect.Effect<void, DbError>;
	/**
	 * Refresh the thin user row and last-sync timestamp after entitlement passes.
	 * Also inserts defensively for older clients that never called /api/users/me.
	 */
	readonly touchUser: (userId: string, email: string | null) => Effect.Effect<void, DbError>;
	/**
	 * Apply a `SubscriptionEntitlementChanged` event to the read-model,
	 * idempotently (inbox dedupe on MessageId). Caller has already filtered on
	 * ProductId. Returns false when the message was a duplicate.
	 */
	readonly applyEntitlement: (event: EntitlementEvent) => Effect.Effect<boolean, DbError>;
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
		// Entitlement read-model — the authoritative copy lives in the shared
		// Payments.Gateway; this is the local cache fed by its RabbitMQ events.
		await sql`
			CREATE TABLE IF NOT EXISTS entitlements (
				user_id              text NOT NULL PRIMARY KEY,
				product_id           text NOT NULL,
				has_access           boolean NOT NULL,
				status               text NOT NULL,
				current_period_end   timestamptz,
				cancel_at_period_end boolean NOT NULL DEFAULT false,
				updated_at           timestamptz NOT NULL DEFAULT now()
			)`;
		// Inbox dedupe for consumed integration events.
		await sql`
			CREATE TABLE IF NOT EXISTS processed_messages (
				message_id   text NOT NULL PRIMARY KEY,
				processed_at timestamptz NOT NULL DEFAULT now()
			)`;
		// Product-local user registry. Identity lives in Keycloak and access lives
		// in entitlements; last_sync_at stays null until an entitled sync succeeds.
		await sql`
			CREATE TABLE IF NOT EXISTS users (
				user_id      text NOT NULL PRIMARY KEY,
				email        text,
				created_at   timestamptz NOT NULL DEFAULT now(),
				last_sync_at timestamptz
			)`;
		// Additive migration for databases created before authenticated-session
		// registration: those rows had a mandatory defaulted sync timestamp.
		await sql`ALTER TABLE users ALTER COLUMN last_sync_at DROP NOT NULL`;
		await sql`ALTER TABLE users ALTER COLUMN last_sync_at DROP DEFAULT`;
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

		const hasAccess: DatabaseService['hasAccess'] = (userId) =>
			Effect.tryPromise({
				try: async () => {
					const rows = await sql<{ has_access: boolean }[]>`
						SELECT has_access FROM entitlements WHERE user_id = ${userId}`;
					return rows[0]?.has_access === true;
				},
				catch: (cause) => new DbError({ cause })
			});

		const registerUser: DatabaseService['registerUser'] = (userId, email) =>
			Effect.tryPromise({
				try: async () => {
					await sql`
						INSERT INTO users (user_id, email, last_sync_at)
						VALUES (${userId}, ${email}, NULL)
						ON CONFLICT (user_id) DO UPDATE
							SET email = COALESCE(excluded.email, users.email)`;
				},
				catch: (cause) => new DbError({ cause })
			});

		const touchUser: DatabaseService['touchUser'] = (userId, email) =>
			Effect.tryPromise({
				try: async () => {
					await sql`
						INSERT INTO users (user_id, email, last_sync_at)
						VALUES (${userId}, ${email}, now())
						ON CONFLICT (user_id) DO UPDATE
							SET last_sync_at = now(),
								email = COALESCE(excluded.email, users.email)`;
				},
				catch: (cause) => new DbError({ cause })
			});

		const applyEntitlement: DatabaseService['applyEntitlement'] = (event) =>
			Effect.tryPromise({
				try: () =>
					sql.begin(async (tx) => {
						const inserted = await tx`
							INSERT INTO processed_messages (message_id)
							VALUES (${event.MessageId})
							ON CONFLICT (message_id) DO NOTHING
							RETURNING message_id`;
						if (inserted.length === 0) return false; // duplicate delivery

						await tx`
							INSERT INTO entitlements
								(user_id, product_id, has_access, status, current_period_end, cancel_at_period_end, updated_at)
							VALUES (
								${event.UserId}, ${event.ProductId}, ${event.HasAccess}, ${event.Status},
								${event.CurrentPeriodEnd ?? null}, ${event.CancelAtPeriodEnd}, now()
							)
							ON CONFLICT (user_id) DO UPDATE
								SET product_id = excluded.product_id,
									has_access = excluded.has_access,
									status = excluded.status,
									current_period_end = excluded.current_period_end,
									cancel_at_period_end = excluded.cancel_at_period_end,
									updated_at = now()`;
						return true;
					}) as Promise<boolean>,
				catch: (cause) => new DbError({ cause })
			});

		return { sync, hasAccess, registerUser, touchUser, applyEntitlement };
	})
);
