import {
  FileSystem,
  HttpServerRequest,
  HttpServerResponse,
} from "@effect/platform";
import { Effect, Option } from "effect";
import { BeanExtractionRequestError } from "./errors.js";
import { BeanExtractor } from "./extractor.js";
import { parseBeanExtractionRequest } from "./request.js";
import { BeanExtractionResponse } from "./response.js";

const MAX_IMAGE_BYTES = FileSystem.MiB(2);

const endpoint = Effect.gen(function* () {
  const request = yield* parseBeanExtractionRequest;
  const extractor = yield* BeanExtractor;
  const response = yield* extractor.extract(request.bytes, request.mimeType);
  return yield* HttpServerResponse.schemaJson(BeanExtractionResponse)(response);
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
