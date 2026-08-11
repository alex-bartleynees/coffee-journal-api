import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiUrl, authenticatedHeaders } from './infrastructure/api.js';
import { integrationContext } from './infrastructure/global-setup.js';

const sync = (path: '/api/sync' | '/sync', userId: string | null, body: unknown) =>
	fetch(apiUrl(path), {
		method: 'POST',
		headers: userId == null
			? { 'content-type': 'application/json' }
			: authenticatedHeaders(userId, { 'content-type': 'application/json' }),
		body: JSON.stringify(body)
	});

describe('sync', () => {
	let sql: ReturnType<typeof postgres>;

	beforeAll(() => { sql = postgres(integrationContext().databaseUrl); });
	afterAll(async () => { await sql.end(); });

	it('rejects an unauthenticated request', async () => {
		const response = await sync('/api/sync', null, { since: 0, changes: [] });

		expect(response.status).toBe(401);
		expect(await response.text()).toBe('Unauthorized: dev mode: missing x-dev-user header');
	});

	it('fails closed when the authenticated user has no entitlement', async () => {
		const response = await sync('/api/sync', crypto.randomUUID(), { since: 0, changes: [] });

		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({ error: 'subscription_required' });
	});

	it('checks entitlement before decoding the request body', async () => {
		const response = await fetch(apiUrl('/api/sync'), {
			method: 'POST',
			headers: authenticatedHeaders(crypto.randomUUID(), { 'content-type': 'application/json' }),
			body: '{invalid json'
		});

		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({ error: 'subscription_required' });
	});

	it('applies and pulls a record, then rejects an equal-timestamp update through the legacy alias', async () => {
		const userId = crypto.randomUUID();
		const recordId = crypto.randomUUID();
		await sql`INSERT INTO entitlements (user_id, product_id, has_access, status)
			VALUES (${userId}, 'coffee_journal', true, 'active')`;
		const initialRecord = {
			entity: 'bean', id: recordId, updatedAt: 2_000, deleted: false,
			payload: { name: 'Suke Quto', roaster: 'Coffee Collective' }
		};

		const appliedResponse = await sync('/api/sync', userId, { since: 0, changes: [initialRecord] });
		const applied = await appliedResponse.json() as { cursor: number };
		expect(appliedResponse.status).toBe(200);
		expect(applied).toEqual({
			applied: [recordId], rejected: [], changes: [initialRecord], cursor: expect.any(Number)
		});

		const equalTimestamp = { ...initialRecord, payload: { name: 'Equal-timestamp value' } };
		const rejected = await sync('/sync', userId, { since: applied.cursor, changes: [equalTimestamp] });
		expect(rejected.status).toBe(200);
		expect(await rejected.json()).toEqual({
			applied: [], rejected: [initialRecord], changes: [], cursor: applied.cursor
		});
	});

	it('keeps records isolated by user and synchronizes tombstones', async () => {
		const ownerId = crypto.randomUUID();
		const otherUserId = crypto.randomUUID();
		const recordId = crypto.randomUUID();
		await sql`INSERT INTO entitlements (user_id, product_id, has_access, status)
			VALUES (${ownerId}, 'coffee_journal', true, 'active'),
				(${otherUserId}, 'coffee_journal', true, 'active')`;
		const tombstone = { entity: 'brew', id: recordId, updatedAt: 3_000, deleted: true, payload: null };

		const ownerResponse = await sync('/api/sync', ownerId, { since: 0, changes: [tombstone] });
		const ownerBody = await ownerResponse.json();
		expect(ownerResponse.status).toBe(200);
		expect(ownerBody).toMatchObject({ applied: [recordId], changes: [tombstone] });

		const otherResponse = await sync('/api/sync', otherUserId, { since: 0, changes: [] });
		expect(otherResponse.status).toBe(200);
		expect(await otherResponse.json()).toEqual({ applied: [], rejected: [], changes: [], cursor: 0 });
	});
});
