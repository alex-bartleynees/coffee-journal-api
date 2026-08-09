import { FileSystem, HttpRouter, HttpServerRequest, HttpServerResponse } from '@effect/platform';
import { Effect, Option } from 'effect';
import { Auth } from './Auth.js';
import { Database } from './Database.js';
import { Keycloak } from './Keycloak.js';
import { CreateUserRequest, SyncRequest, SyncResponse } from './schema.js';

const textStatus = (body: string, status: number) =>
	Effect.succeed(HttpServerResponse.setStatus(HttpServerResponse.text(body), status));

const signupAttempts = new Map<string, { count: number; resetsAt: number }>();
const SIGNUP_WINDOW_MS = 15 * 60 * 1000;
const SIGNUP_LIMIT = 5;

function clientIp(headers: Record<string, string>): string {
	return headers['x-forwarded-for']?.split(',')[0]?.trim() || headers['x-real-ip'] || 'unknown';
}

function allowSignup(ip: string): boolean {
	const now = Date.now();
	if (signupAttempts.size > 10_000) {
		for (const [key, value] of signupAttempts) {
			if (value.resetsAt <= now) signupAttempts.delete(key);
		}
	}
	const current = signupAttempts.get(ip);
	if (!current || current.resetsAt <= now) {
		signupAttempts.set(ip, { count: 1, resetsAt: now + SIGNUP_WINDOW_MS });
		return true;
	}
	current.count += 1;
	return current.count <= SIGNUP_LIMIT;
}

function validateSignup(input: CreateUserRequest): { name: string; email: string; password: string } | null {
	const name = input.name.trim();
	const email = input.email.trim().toLowerCase();
	if (name.length < 1 || name.length > 100) return null;
	if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
	if (input.password.length < 8 || input.password.length > 128) return null;
	return { name, email, password: input.password };
}

const signupRoute = Effect.gen(function* () {
	const request = yield* HttpServerRequest.HttpServerRequest;
	const keycloak = yield* Keycloak;
	if (!allowSignup(clientIp(request.headers))) {
		return yield* HttpServerResponse.json({ error: 'too_many_requests' }, { status: 429 });
	}

	const parsed = yield* HttpServerRequest.schemaBodyJson(CreateUserRequest);
	const user = validateSignup(parsed);
	if (!user) return yield* HttpServerResponse.json({ error: 'invalid_request' }, { status: 400 });

	const outcome = yield* keycloak.createUser(user);
	return yield* HttpServerResponse.json({ created: outcome === 'created', existing: outcome === 'existing' }, { status: 201 });
}).pipe(
	HttpServerRequest.withMaxBodySize(Option.some(FileSystem.KiB(4))),
	Effect.catchTags({
		KeycloakUnavailableError: (cause) =>
			Effect.zipRight(
				Effect.logError('Keycloak signup request failed', { reason: cause.reason }),
				HttpServerResponse.json({ error: 'identity_provider_unavailable' }, { status: 503 })
			),
		ParseError: () => HttpServerResponse.json({ error: 'invalid_request' }, { status: 400 }),
		RequestError: () => HttpServerResponse.json({ error: 'invalid_request' }, { status: 400 })
	}),
	Effect.catchAll((cause) =>
		Effect.zipRight(
			Effect.logError('signup failed', cause),
			HttpServerResponse.json({ error: 'internal_error' }, { status: 500 })
		)
	)
);

/** Register the authenticated Keycloak identity as a Bloom user. Idempotent and
 * independent from subscription entitlement; the JWT proves account ownership. */
const registerCurrentUserRoute = Effect.gen(function* () {
	const request = yield* HttpServerRequest.HttpServerRequest;
	const auth = yield* Auth;
	const db = yield* Database;
	const user = yield* auth.user(request.headers);
	yield* db.registerUser(user.userId, user.email);
	return yield* HttpServerResponse.json({ registered: true });
}).pipe(
	Effect.catchTags({ AuthError: () => textStatus('Unauthorized', 401) }),
	Effect.catchAll((cause) =>
		Effect.zipRight(
			Effect.logError('user registration failed', cause),
			textStatus('Internal server error', 500)
		)
	)
);

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

	const body = yield* HttpServerRequest.schemaBodyJson(SyncRequest);
	const result = yield* db.sync(user.userId, body);
	yield* db.touchUser(user.userId, user.email);
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
	HttpRouter.post('/api/users', signupRoute),
	HttpRouter.post('/api/users/me', registerCurrentUserRoute),
	HttpRouter.post('/sync', syncRoute),
	// The BFF's YARP proxy forwards /api/* with the path intact, so the same
	// handler answers under the /api prefix — no proxy-side path transform needed.
	HttpRouter.post('/api/sync', syncRoute)
);
