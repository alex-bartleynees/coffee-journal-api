import { HttpServerRequest } from "@effect/platform";
import { Effect } from "effect";
import { PhotoRequestError } from "../errors.js";
import { authorizePhotoRequest, parsePhotoBeanId } from "../request.js";
import {
  parsePhotoMimeType,
  parseUpdatedAt,
  type PhotoMimeType,
} from "../validation.js";

export type PutPhotoRequest = {
  readonly userId: string;
  readonly beanId: string;
  readonly updatedAt: number;
  readonly mimeType: PhotoMimeType;
  readonly bytes: Uint8Array;
};

export const parsePutPhotoRequest = Effect.gen(function* () {
  const httpRequest = yield* HttpServerRequest.HttpServerRequest;
  const user = yield* authorizePhotoRequest(httpRequest.headers);
  const beanId = yield* parsePhotoBeanId;
  const updatedAt = yield* parseUpdatedAt(
    httpRequest.headers["x-photo-updated-at"],
  );
  const mimeType = yield* parsePhotoMimeType(
    httpRequest.headers["content-type"]?.split(";")[0]?.trim() ?? "",
  );
  const bytes = new Uint8Array(yield* httpRequest.arrayBuffer);
  if (bytes.byteLength === 0) {
    return yield* new PhotoRequestError({ status: 400, code: "empty_photo" });
  }
  return {
    userId: user.userId,
    beanId,
    updatedAt,
    mimeType,
    bytes,
  } satisfies PutPhotoRequest;
});
