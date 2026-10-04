import { HttpServerRequest, HttpServerResponse } from "effect/http";
import { ByteSize, Effect } from "effect";
import { BeanExtractionRequestError } from "./errors.js";
import { BeanExtractor } from "./extractor.js";
import { parseBeanExtractionRequest } from "./request.js";
import { BeanExtractionResponse } from "./response.js";

const MAX_IMAGE_BYTES = ByteSize.mebibytes(2);

const endpoint = Effect.gen(function* () {
  const request = yield* parseBeanExtractionRequest;
  const extractor = yield* BeanExtractor;
  const response = yield* extractor.extract(request.bytes, request.mimeType);
  return yield* HttpServerResponse.schemaJson(BeanExtractionResponse)(response);
}).pipe(
  Effect.withSpan("coffee.bean_extraction", { kind: "internal" }),
  Effect.provideService(HttpServerRequest.MaxBodySize, MAX_IMAGE_BYTES),
);

export const beanExtractionEndpoint = endpoint.pipe(
  Effect.catch((cause) => {
    if (cause instanceof BeanExtractionRequestError) {
      return HttpServerResponse.json(
        { error: cause.code },
        { status: cause.status },
      );
    }
    if ((cause as { _tag?: string })._tag === "AuthError") {
      return Effect.succeed(
        HttpServerResponse.setStatus(
          HttpServerResponse.text("Unauthorized"),
          401,
        ),
      );
    }
    return Effect.andThen(
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
