import {
  FileSystem,
  HttpServerRequest,
  HttpServerResponse,
} from "@effect/platform";
import { Effect, Option } from "effect";
import { Auth } from "../../../shared/auth.js";
import { EntitlementRepository } from "../../entitlements/repository.js";
import { BeanExtractionResponse } from "./contract.js";
import { BeanExtractionRequestError } from "./errors.js";
import { BeanExtractor } from "./extractor.js";

const MAX_IMAGE_BYTES = FileSystem.MiB(2);
const SUPPORTED_IMAGE = /^image\/(webp|jpeg|png)$/;

const endpoint = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  const auth = yield* Auth;
  const entitlements = yield* EntitlementRepository;
  const user = yield* auth.user(request.headers);

  if (!(yield* entitlements.hasAccess(user.userId))) {
    return yield* new BeanExtractionRequestError({
      status: 403,
      code: "subscription_required",
    });
  }

  const mimeType = request.headers["content-type"]?.split(";")[0]?.trim() ?? "";
  if (!SUPPORTED_IMAGE.test(mimeType)) {
    return yield* new BeanExtractionRequestError({
      status: 415,
      code: "unsupported_image",
    });
  }

  const bytes = new Uint8Array(yield* request.arrayBuffer);
  if (bytes.byteLength === 0) {
    return yield* new BeanExtractionRequestError({
      status: 400,
      code: "empty_image",
    });
  }

  const extractor = yield* BeanExtractor;
  const result = yield* extractor.extract(bytes, mimeType);
  return yield* HttpServerResponse.schemaJson(BeanExtractionResponse)(result);
}).pipe(
  Effect.withSpan("coffee.bean_extraction", { kind: "internal" }),
  HttpServerRequest.withMaxBodySize(Option.some(MAX_IMAGE_BYTES)),
);

export const beanExtractionEndpoint = endpoint.pipe(
  Effect.catchAll((cause) => {
    if (cause instanceof BeanExtractionRequestError) {
      return HttpServerResponse.json(
        { error: cause.code },
        { status: cause.status },
      );
    }
    if ((cause as { _tag?: string })._tag === "AuthError") {
      return Effect.succeed(
        HttpServerResponse.setStatus(HttpServerResponse.text("Unauthorized"), 401),
      );
    }
    return Effect.zipRight(
      Effect.logError("bean extraction failed", cause),
      Effect.succeed(
        HttpServerResponse.setStatus(
          HttpServerResponse.text("Bean extraction unavailable"),
          503,
        ),
      ),
    );
  }),
);
