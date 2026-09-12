import { HttpServerRequest, HttpServerResponse } from "@effect/platform";
import { Effect } from "effect";
import { Auth } from "../../../shared/auth.js";
import { RegisterCurrentUserRequest } from "./request.js";
import { RegisterCurrentUserResponse } from "./response.js";
import { registerCurrentUser } from "./use-case.js";

const textStatus = (body: string, status: number) =>
  Effect.succeed(
    HttpServerResponse.setStatus(HttpServerResponse.text(body), status),
  );

export const registerCurrentUserEndpoint = Effect.gen(function* () {
  const httpRequest = yield* HttpServerRequest.HttpServerRequest;
  const auth = yield* Auth;
  const request = yield* auth.user(httpRequest.headers);
  const response = yield* registerCurrentUser(
    request satisfies RegisterCurrentUserRequest,
  );
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
