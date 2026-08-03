import { HttpRouter, HttpServerRequest, HttpServerResponse } from '@effect/platform';
import { Effect } from 'effect';
import { Auth } from './Auth.js';
import { Database } from './Database.js';
import { SyncRequest, SyncResponse } from './schema.js';

const textStatus = (body: string, status: number) =>
	Effect.succeed(HttpServerResponse.setStatus(HttpServerResponse.text(body), status));

/**
 * POST /sync — authenticate, enforce the subscription entitlement (fail-closed
 * against the local read-model), decode the delta request, run the LWW
 * push+pull, and return the delta response. Failures are mapped to HTTP status
 * codes; anything unexpected is logged and returned as 500.
 */
const syncRoute = Effect.gen(function* () {
	const request = yield* HttpServerRequest.HttpServerRequest;
	const auth = yield* Auth;
	const db = yield* Database;

	const user = yield* auth.user(request.headers);

	// Shared Keycloak realm ⇒ any product's user can authenticate here.
	// Product membership is this entitlement check: free tier is local-only,
	// so sync access ≡ being a (subscribed) Bloom user.
	const entitled = yield* db.hasAccess(user.userId);
	if (!entitled) {
		return yield* HttpServerResponse.json({ error: 'subscription_required' }, { status: 403 });
	}
	yield* db.touchUser(user.userId, user.email);

	const body = yield* HttpServerRequest.schemaBodyJson(SyncRequest);
	const result = yield* db.sync(user.userId, body);
	return yield* HttpServerResponse.schemaJson(SyncResponse)(result);
}).pipe(
	Effect.catchTags({
		AuthError: (e) => textStatus(`Unauthorized: ${e.reason}`, 401),
		ParseError: () => textStatus('Invalid request body', 400),
		RequestError: () => textStatus('Invalid request body', 400)
	}),
	Effect.catchAll((cause) =>
		Effect.zipRight(
			Effect.logError('sync failed', cause),
			textStatus('Internal server error', 500)
		)
	)
);

export const router = HttpRouter.empty.pipe(
	HttpRouter.get('/health', Effect.succeed(HttpServerResponse.text('ok'))),
	HttpRouter.post('/sync', syncRoute),
	// The BFF's YARP proxy forwards /api/* with the path intact, so the same
	// handler answers under the /api prefix — no proxy-side path transform needed.
	HttpRouter.post('/api/sync', syncRoute)
);
