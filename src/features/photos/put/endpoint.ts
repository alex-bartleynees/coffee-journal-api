import { HttpServerRequest, HttpServerResponse } from "effect/http";
import { ByteSize, Effect } from "effect";
import { handlePhotoFailures } from "../endpoint-support.js";
import { putPhoto } from "../use-cases.js";
import { parsePutPhotoRequest } from "./request.js";
import { PutPhotoResponse } from "./response.js";

const MAX_PHOTO_BYTES = ByteSize.mebibytes(2);

export const putPhotoEndpoint = handlePhotoFailures(
  Effect.gen(function* () {
    const request = yield* parsePutPhotoRequest;
    const response = yield* putPhoto(request);
    return yield* HttpServerResponse.schemaJson(PutPhotoResponse)(response);
  }).pipe(
    Effect.provideService(HttpServerRequest.MaxBodySize, MAX_PHOTO_BYTES),
  ),
);
