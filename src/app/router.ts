import { HttpRouter, HttpServerResponse } from '@effect/platform';
import { Effect } from 'effect';
import { photosRouter } from '../features/photos/router.js';
import { syncRouter } from '../features/sync/router.js';
import { usersRouter } from '../features/users/router.js';

export const router = HttpRouter.empty.pipe(
	HttpRouter.concat(photosRouter),
	HttpRouter.concat(syncRouter),
	HttpRouter.concat(usersRouter),
	HttpRouter.get('/health', Effect.succeed(HttpServerResponse.text('ok')))
);
