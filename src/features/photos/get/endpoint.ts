import { HttpServerResponse } from '@effect/platform';
import { Effect } from 'effect';
import { handlePhotoFailures } from '../endpoint-support.js';
import { PhotoRequestError } from '../errors.js';
import { photoRequestContext } from '../request-context.js';
import { getPhoto } from '../use-cases.js';

export const getPhotoEndpoint = handlePhotoFailures(Effect.gen(function* () {
	const { user, beanId } = yield* photoRequestContext;
	if (!beanId) return yield* new PhotoRequestError({ status: 400, code: 'invalid_bean_id' });
	const photo = yield* getPhoto(user.userId, beanId);
	return HttpServerResponse.uint8Array(photo.bytes, { contentType: photo.mimeType });
}));
