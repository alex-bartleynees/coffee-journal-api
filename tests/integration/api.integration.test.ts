import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import postgres, { type Sql } from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const POSTGRES_IMAGE = 'postgres:17';
const STARTUP_TIMEOUT_MS = 30_000;

let database: StartedPostgreSqlContainer;
let sql: Sql;
let api: ChildProcess;
let baseUrl: string;
let apiOutput = '';

const availablePort = () =>
	new Promise<number>((resolve, reject) => {
		const server = createServer();
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => {
			const address = server.address();
			if (address == null || typeof address === 'string') {
				server.close();
				reject(new Error('Could not allocate an integration-test port'));
				return;
			}
			server.close((error) => error ? reject(error) : resolve(address.port));
		});
	});

const waitForApi = async () => {
	const deadline = Date.now() + STARTUP_TIMEOUT_MS;
	while (Date.now() < deadline) {
		if (api.exitCode != null) throw new Error(`API exited during startup (${api.exitCode})\n${apiOutput}`);
		try {
			const response = await fetch(`${baseUrl}/health`);
			if (response.ok) return;
		} catch {
			// The server has not bound its socket yet.
		}
		await delay(100);
	}
	throw new Error(`API did not become healthy\n${apiOutput}`);
};

beforeAll(async () => {
	database = await new PostgreSqlContainer(POSTGRES_IMAGE)
		.withDatabase('coffee_journal')
		.start();
	sql = postgres(database.getConnectionUri());

	const port = await availablePort();
	baseUrl = `http://127.0.0.1:${port}`;
	api = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
		cwd: process.cwd(),
		env: {
			...process.env,
			PORT: String(port),
			DATABASE_URL: database.getConnectionUri(),
			KEYCLOAK_JWKS_URL: '',
			KEYCLOAK_ISSUER: '',
			RABBITMQ_URL: '',
			S3_ENDPOINT: '',
			S3_REGION: '',
			S3_BUCKET: '',
			S3_ACCESS_KEY_ID: '',
			S3_SECRET_ACCESS_KEY: ''
		},
		stdio: ['ignore', 'pipe', 'pipe']
	});
	api.stdout?.on('data', (chunk: Buffer) => { apiOutput += chunk.toString(); });
	api.stderr?.on('data', (chunk: Buffer) => { apiOutput += chunk.toString(); });
	await waitForApi();
}, 60_000);

afterAll(async () => {
	if (api?.exitCode == null) {
		api.kill('SIGTERM');
		await Promise.race([
			new Promise<void>((resolve) => api.once('exit', () => resolve())),
			delay(5_000).then(() => { if (api.exitCode == null) api.kill('SIGKILL'); })
		]);
	}
	await sql?.end();
	await database?.stop();
});

describe('coffee journal API', () => {
	it('reports healthy through the real HTTP server', async () => {
		const response = await fetch(`${baseUrl}/health`);

		expect(response.status).toBe(200);
		expect(await response.text()).toBe('ok');
	});

	it('rejects an unauthenticated sync request', async () => {
		const response = await fetch(`${baseUrl}/api/sync`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ since: 0, changes: [] })
		});

		expect(response.status).toBe(401);
		expect(await response.text()).toBe('Unauthorized: dev mode: missing x-dev-user header');
	});

	it('fails closed when the authenticated user has no entitlement', async () => {
		const userId = crypto.randomUUID();
		const response = await fetch(`${baseUrl}/api/sync`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', 'x-dev-user': userId },
			body: JSON.stringify({ since: 0, changes: [] })
		});

		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({ error: 'subscription_required' });
	});

	it('registers the authenticated user idempotently', async () => {
		const userId = crypto.randomUUID();
		for (let attempt = 0; attempt < 2; attempt += 1) {
			const response = await fetch(`${baseUrl}/api/users/me`, {
				method: 'POST',
				headers: { 'x-dev-user': userId }
			});

			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({ registered: true });
		}

		const rows = await sql<{ user_id: string; last_sync_at: Date | null }[]>`
			SELECT user_id, last_sync_at FROM users WHERE user_id = ${userId}`;
		expect(rows).toHaveLength(1);
		expect(rows[0]).toEqual({ user_id: userId, last_sync_at: null });
	});

	it('applies and pulls a record, then rejects a stale update through the legacy route alias', async () => {
		const userId = crypto.randomUUID();
		const recordId = crypto.randomUUID();
		await sql`
			INSERT INTO entitlements (user_id, product_id, has_access, status)
			VALUES (${userId}, 'coffee_journal', true, 'active')`;

		const initialRecord = {
			entity: 'bean',
			id: recordId,
			updatedAt: 2_000,
			deleted: false,
			payload: { name: 'Suke Quto', roaster: 'Coffee Collective' }
		};
		const appliedResponse = await fetch(`${baseUrl}/api/sync`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', 'x-dev-user': userId },
			body: JSON.stringify({ since: 0, changes: [initialRecord] })
		});
		const applied = await appliedResponse.json() as {
			applied: string[];
			rejected: unknown[];
			changes: unknown[];
			cursor: number;
		};

		expect(appliedResponse.status).toBe(200);
		expect(applied).toEqual({
			applied: [recordId],
			rejected: [],
			changes: [initialRecord],
			cursor: expect.any(Number)
		});
		expect(applied.cursor).toBeGreaterThan(0);

		const staleRecord = { ...initialRecord, payload: { name: 'Equal-timestamp value' } };
		const staleResponse = await fetch(`${baseUrl}/sync`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', 'x-dev-user': userId },
			body: JSON.stringify({ since: applied.cursor, changes: [staleRecord] })
		});

		expect(staleResponse.status).toBe(200);
			expect(await staleResponse.json()).toEqual({
			applied: [],
			rejected: [initialRecord],
			changes: [],
			cursor: applied.cursor
		});
	});

	it('keeps records isolated by user and synchronizes tombstones', async () => {
		const ownerId = crypto.randomUUID();
		const otherUserId = crypto.randomUUID();
		const recordId = crypto.randomUUID();
		await sql`
			INSERT INTO entitlements (user_id, product_id, has_access, status)
			VALUES
				(${ownerId}, 'coffee_journal', true, 'active'),
				(${otherUserId}, 'coffee_journal', true, 'active')`;

		const tombstone = {
			entity: 'brew',
			id: recordId,
			updatedAt: 3_000,
			deleted: true,
			payload: null
		};
		const ownerResponse = await fetch(`${baseUrl}/api/sync`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', 'x-dev-user': ownerId },
			body: JSON.stringify({ since: 0, changes: [tombstone] })
		});
		const ownerBody = await ownerResponse.json() as { cursor: number };

		expect(ownerResponse.status).toBe(200);
		expect(ownerBody).toMatchObject({ applied: [recordId], changes: [tombstone] });
		expect(ownerBody.cursor).toBeGreaterThan(0);

		const otherResponse = await fetch(`${baseUrl}/api/sync`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', 'x-dev-user': otherUserId },
			body: JSON.stringify({ since: 0, changes: [] })
		});

		expect(otherResponse.status).toBe(200);
		expect(await otherResponse.json()).toEqual({ applied: [], rejected: [], changes: [], cursor: 0 });
	});
});
