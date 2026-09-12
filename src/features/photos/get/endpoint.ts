import { HttpServerResponse } from "@effect/platform";
import { Effect } from "effect";
import { handlePhotoFailures } from "../endpoint-support.js";
import { getPhoto } from "../use-cases.js";
import { parseGetPhotoRequest } from "./request.js";

export const getPhotoEndpoint = handlePhotoFailures(
  Effect.gen(function* () {
    const request = yield* parseGetPhotoRequest;
    const response = yield* getPhoto(request);
    return HttpServerResponse.uint8Array(response.bytes, {
      contentType: response.mimeType,
    });
  }),
);
