import { HttpServerResponse } from '@effect/platform';
import { Effect } from 'effect';
import { PhotoRequestError } from './errors.js';

const textStatus = (body: string, status: number) =>
	Effect.succeed(HttpServerResponse.setStatus(HttpServerResponse.text(body), status));

export const handlePhotoFailures = <E, R>(
	effect: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>
) =>
	effect.pipe(
		Effect.catchAll((cause) => {
			if (cause instanceof PhotoRequestError) {
				return HttpServerResponse.json({ error: cause.code }, { status: cause.status });
			}
			if ((cause as { _tag?: string })._tag === 'AuthError') return textStatus('Unauthorized', 401);
			return Effect.zipRight(
				Effect.logError('photo sync failed', cause),
				textStatus('Internal server error', 500)
			);
		})
	);
