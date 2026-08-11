import { FileSystem, HttpServerRequest, HttpServerResponse } from '@effect/platform';
import { Effect, Option } from 'effect';
import { PhotoMutationResponse } from '../contract.js';
import { handlePhotoFailures } from '../endpoint-support.js';
import { PhotoRequestError } from '../errors.js';
import { photoRequestContext } from '../request-context.js';
import { putPhoto } from '../use-cases.js';

const MAX_PHOTO_BYTES = FileSystem.MiB(2);

export const putPhotoEndpoint = handlePhotoFailures(Effect.gen(function* () {
	const { request, user, beanId } = yield* photoRequestContext;
	const updatedAt = Number(request.headers['x-photo-updated-at']);
	const mimeType = request.headers['content-type']?.split(';')[0]?.trim() ?? '';
	if (!beanId || !Number.isSafeInteger(updatedAt) || updatedAt <= 0 || !/^image\/(webp|jpeg|png)$/.test(mimeType)) {
		return yield* new PhotoRequestError({ status: 400, code: 'invalid_photo' });
	}
	const bytes = new Uint8Array(yield* request.arrayBuffer);
	if (bytes.byteLength === 0) {
		return yield* new PhotoRequestError({ status: 400, code: 'empty_photo' });
	}
	const response = yield* putPhoto(
		user.userId,
		{ beanId, updatedAt, deleted: false, mimeType },
		bytes
	);
	return yield* HttpServerResponse.schemaJson(PhotoMutationResponse)(response);
}).pipe(HttpServerRequest.withMaxBodySize(Option.some(MAX_PHOTO_BYTES))));
