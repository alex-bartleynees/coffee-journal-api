import { Effect, Layer } from 'effect';
import postgres from 'postgres';
import { DbError } from '../../shared/persistence/errors.js';
import { Postgres } from '../../shared/persistence/Postgres.js';
import type { SyncRecord, SyncResponse } from './contract.js';
import { SyncRepository, type SyncRepositoryService } from './repository.js';

type Row = { entity: SyncRecord['entity']; id: string; payload: unknown; updated_at: string; deleted: boolean; server_seq: string };

const rowToRecord = (row: Row): SyncRecord => ({
	entity: row.entity, id: row.id, updatedAt: Number(row.updated_at),
	deleted: row.deleted, payload: row.payload ?? null
});

export const SyncRepositoryLive = Layer.effect(
	SyncRepository,
	Effect.gen(function* () {
		const { sql } = yield* Postgres;
		const run: SyncRepositoryService['run'] = (userId, request) => Effect.tryPromise({
			try: () => sql.begin(async (tx) => {
				const applied: string[] = [];
				const rejectedRefs: { entity: string; id: string }[] = [];
				for (const record of request.changes) {
					const rows = await tx`
						INSERT INTO sync_records AS sr (user_id, entity, id, payload, updated_at, deleted, server_seq)
						VALUES (${userId}, ${record.entity}, ${record.id},
							${record.payload === null ? null : tx.json(record.payload as postgres.JSONValue)},
							${record.updatedAt}, ${record.deleted}, nextval('sync_seq'))
						ON CONFLICT (user_id, entity, id) DO UPDATE
							SET payload = excluded.payload, updated_at = excluded.updated_at,
								deleted = excluded.deleted, server_seq = excluded.server_seq
							WHERE excluded.updated_at > sr.updated_at
						RETURNING id`;
					if (rows.length > 0) applied.push(record.id);
					else rejectedRefs.push({ entity: record.entity, id: record.id });
				}
				const rejected: SyncRecord[] = [];
				for (const ref of rejectedRefs) {
					const current = await tx<Row[]>`
						SELECT entity, id, payload, updated_at, deleted, server_seq FROM sync_records
						WHERE user_id = ${userId} AND entity = ${ref.entity} AND id = ${ref.id}`;
					if (current[0]) rejected.push(rowToRecord(current[0]));
				}
				const rows = await tx<Row[]>`
					SELECT entity, id, payload, updated_at, deleted, server_seq FROM sync_records
					WHERE user_id = ${userId} AND server_seq > ${request.since} ORDER BY server_seq ASC`;
				return {
					applied, rejected, changes: rows.map(rowToRecord),
					cursor: rows.reduce((max, row) => Math.max(max, Number(row.server_seq)), request.since)
				} satisfies SyncResponse;
			}) as Promise<SyncResponse>,
			catch: (cause) => new DbError({ cause })
		});
		return { run };
	})
);
