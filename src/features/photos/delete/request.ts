import { HttpServerRequest } from "@effect/platform";
import { Effect } from "effect";
import { authorizePhotoRequest, parsePhotoBeanId } from "../request.js";
import { parseUpdatedAt } from "../validation.js";

export type DeletePhotoRequest = {
  readonly userId: string;
  readonly beanId: string;
  readonly updatedAt: number;
};

export const parseDeletePhotoRequest = Effect.gen(function* () {
  const httpRequest = yield* HttpServerRequest.HttpServerRequest;
  const user = yield* authorizePhotoRequest(httpRequest.headers);
  const beanId = yield* parsePhotoBeanId;
  const updatedAt = yield* parseUpdatedAt(
    httpRequest.headers["x-photo-updated-at"],
  );
  return { userId: user.userId, beanId, updatedAt } satisfies DeletePhotoRequest;
});
