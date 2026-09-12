import { HttpServerResponse } from "@effect/platform";
import { Effect } from "effect";
import { handlePhotoFailures } from "../endpoint-support.js";
import { listPhotos } from "../use-cases.js";
import { parsePhotoManifestRequest } from "./request.js";
import { PhotoManifestResponse } from "./response.js";

export const photoManifestEndpoint = handlePhotoFailures(
  Effect.gen(function* () {
    const request = yield* parsePhotoManifestRequest;
    const response = yield* listPhotos(request);
    return yield* HttpServerResponse.schemaJson(PhotoManifestResponse)(response);
  }),
);
