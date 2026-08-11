import { HttpServerResponse } from '@effect/platform';
import { Effect } from 'effect';
import { PhotoManifest } from '../contract.js';
import { handlePhotoFailures } from '../endpoint-support.js';
import { photoRequestContext } from '../request-context.js';
import { listPhotos } from '../use-cases.js';

export const photoManifestEndpoint = handlePhotoFailures(Effect.gen(function* () {
	const { user } = yield* photoRequestContext;
	const photos = yield* listPhotos(user.userId);
	return yield* HttpServerResponse.schemaJson(PhotoManifest)({ photos });
}));
