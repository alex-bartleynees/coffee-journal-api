import { HttpServerRequest } from "@effect/platform";
import { Effect } from "effect";
import { authorizePhotoRequest, parsePhotoBeanId } from "../request.js";

export type GetPhotoRequest = {
  readonly userId: string;
  readonly beanId: string;
};

export const parseGetPhotoRequest = Effect.gen(function* () {
  const httpRequest = yield* HttpServerRequest.HttpServerRequest;
  const user = yield* authorizePhotoRequest(httpRequest.headers);
  const beanId = yield* parsePhotoBeanId;
  return { userId: user.userId, beanId } satisfies GetPhotoRequest;
});
