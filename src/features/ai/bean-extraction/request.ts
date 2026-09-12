import { HttpServerRequest } from "@effect/platform";
import { Effect, Schema } from "effect";
import { Auth } from "../../../shared/auth.js";
import { EntitlementRepository } from "../../entitlements/repository.js";
import { BeanExtractionRequestError } from "./errors.js";

export const BeanExtractionMimeType = Schema.Literal(
  "image/webp",
  "image/jpeg",
  "image/png",
);

export const BeanExtractionRequest = Schema.Struct({
  bytes: Schema.Uint8ArrayFromSelf,
  mimeType: BeanExtractionMimeType,
});
export type BeanExtractionRequest = typeof BeanExtractionRequest.Type;

const decodeMimeType = Schema.decodeUnknown(BeanExtractionMimeType);

export const parseBeanExtractionRequest = Effect.gen(function* () {
  const httpRequest = yield* HttpServerRequest.HttpServerRequest;
  const auth = yield* Auth;
  const entitlements = yield* EntitlementRepository;
  const user = yield* auth.user(httpRequest.headers);
  if (!(yield* entitlements.hasAccess(user.userId))) {
    return yield* new BeanExtractionRequestError({
      status: 403,
      code: "subscription_required",
    });
  }
  const mimeType = yield* decodeMimeType(
    httpRequest.headers["content-type"]?.split(";")[0]?.trim() ?? "",
  ).pipe(
    Effect.mapError(
      () =>
        new BeanExtractionRequestError({
          status: 415,
          code: "unsupported_image",
        }),
    ),
  );
  const bytes = new Uint8Array(yield* httpRequest.arrayBuffer);
  if (bytes.byteLength === 0) {
    return yield* new BeanExtractionRequestError({
      status: 400,
      code: "empty_image",
    });
  }
  return { bytes, mimeType } satisfies BeanExtractionRequest;
});
