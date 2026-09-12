import { HttpServerRequest } from "@effect/platform";
import { Effect } from "effect";
import { authorizePhotoRequest } from "../request.js";

export type PhotoManifestRequest = {
  readonly userId: string;
};

export const parsePhotoManifestRequest = Effect.gen(function* () {
  const httpRequest = yield* HttpServerRequest.HttpServerRequest;
  const user = yield* authorizePhotoRequest(httpRequest.headers);
  return { userId: user.userId } satisfies PhotoManifestRequest;
});
