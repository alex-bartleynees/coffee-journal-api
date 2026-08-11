import postgres from 'postgres';
import { describe, expect, it } from 'vitest';
import { apiUrl, authenticatedHeaders } from './infrastructure/api.js';
import { integrationContext } from './infrastructure/global-setup.js';

describe('users', () => {
	it('registers the authenticated user idempotently', async () => {
		const userId = crypto.randomUUID();
		for (let attempt = 0; attempt < 2; attempt += 1) {
			const response = await fetch(apiUrl('/api/users/me'), {
				method: 'POST',
				headers: authenticatedHeaders(userId)
			});

			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({ registered: true });
		}

		const sql = postgres(integrationContext().databaseUrl);
		try {
			const rows = await sql<{ user_id: string; last_sync_at: Date | null }[]>`
				SELECT user_id, last_sync_at FROM users WHERE user_id = ${userId}`;
			expect(rows).toHaveLength(1);
			expect(rows[0]).toEqual({ user_id: userId, last_sync_at: null });
		} finally {
			await sql.end();
		}
	});
});
