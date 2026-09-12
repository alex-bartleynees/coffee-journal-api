import {
  FileSystem,
  HttpServerRequest,
  HttpServerResponse,
} from "@effect/platform";
import { Effect, Option } from "effect";
import { claimSignupAttempt, createUser } from "./use-case.js";
import { CreateUserRequest } from "./request.js";
import { CreateUserResponse } from "./response.js";

const clientIp = (headers: Record<string, string>) =>
  headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
  headers["x-real-ip"] ||
  "unknown";

export const signupEndpoint = Effect.gen(function* () {
  const httpRequest = yield* HttpServerRequest.HttpServerRequest;
  yield* claimSignupAttempt(clientIp(httpRequest.headers));
  const request = yield* HttpServerRequest.schemaBodyJson(CreateUserRequest);
  const response = yield* createUser(request);
  return yield* HttpServerResponse.schemaJson(CreateUserResponse)(response, {
    status: 201,
  });
}).pipe(
  HttpServerRequest.withMaxBodySize(Option.some(FileSystem.KiB(4))),
  Effect.catchTags({
    SignupRateLimited: () =>
      HttpServerResponse.json({ error: "too_many_requests" }, { status: 429 }),
    KeycloakUnavailableError: (cause) =>
      Effect.zipRight(
        Effect.logError("Keycloak signup request failed", {
          reason: cause.reason,
        }),
        HttpServerResponse.json(
          { error: "identity_provider_unavailable" },
          { status: 503 },
        ),
      ),
    ParseError: () =>
      HttpServerResponse.json({ error: "invalid_request" }, { status: 400 }),
    RequestError: () =>
      HttpServerResponse.json({ error: "invalid_request" }, { status: 400 }),
  }),
  Effect.catchAll((cause) =>
    Effect.zipRight(
      Effect.logError("signup failed", cause),
      HttpServerResponse.json({ error: "internal_error" }, { status: 500 }),
    ),
  ),
);
