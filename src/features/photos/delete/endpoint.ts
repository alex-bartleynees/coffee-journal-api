import { HttpServerResponse } from "@effect/platform";
import { Effect } from "effect";
import { handlePhotoFailures } from "../endpoint-support.js";
import { deletePhoto } from "../use-cases.js";
import { parseDeletePhotoRequest } from "./request.js";
import { DeletePhotoResponse } from "./response.js";

export const deletePhotoEndpoint = handlePhotoFailures(
  Effect.gen(function* () {
    const request = yield* parseDeletePhotoRequest;
    const response = yield* deletePhoto(request);
    return yield* HttpServerResponse.schemaJson(DeletePhotoResponse)(response);
  }),
);
