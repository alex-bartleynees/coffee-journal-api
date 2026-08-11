import type { Headers } from '@effect/platform';
import { Effect } from 'effect';
import { Auth } from '../../../Auth.js';
import { Database } from '../../../Database.js';

/** Register a verified identity independently from subscription access. */
export const registerCurrentUser = (headers: Headers.Headers) =>
	Effect.gen(function* () {
		const auth = yield* Auth;
		const database = yield* Database;
		const user = yield* auth.user(headers);
		yield* database.registerUser(user.userId, user.email);
		return { registered: true } as const;
	});
