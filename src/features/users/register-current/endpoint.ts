import { HttpServerRequest, HttpServerResponse } from "@effect/platform";
import { Effect } from "effect";
import { RegisterCurrentUserResponse } from "./contract.js";
import { registerCurrentUser } from "./use-case.js";

const textStatus = (body: string, status: number) =>
  Effect.succeed(
    HttpServerResponse.setStatus(HttpServerResponse.text(body), status),
  );

export const registerCurrentUserEndpoint = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  const response = yield* registerCurrentUser(request.headers);
  return yield* HttpServerResponse.schemaJson(RegisterCurrentUserResponse)(
    response,
  );
}).pipe(
  Effect.catchTags({ AuthError: () => textStatus("Unauthorized", 401) }),
  Effect.catchAll((cause) =>
    Effect.zipRight(
      Effect.logError("user registration failed", cause),
      textStatus("Internal server error", 500),
    ),
  ),
);
