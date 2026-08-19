import {
  FileSystem,
  HttpServerRequest,
  HttpServerResponse,
} from "@effect/platform";
import { Effect, Option } from "effect";
import { CreateUserRequest, CreateUserResponse } from "./contract.js";
import { claimSignupAttempt, createUser } from "./use-case.js";

const clientIp = (headers: Record<string, string>) =>
  headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
  headers["x-real-ip"] ||
  "unknown";

export const signupEndpoint = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  yield* claimSignupAttempt(clientIp(request.headers));
  const input = yield* HttpServerRequest.schemaBodyJson(CreateUserRequest);
  const response = yield* createUser(input);
  return yield* HttpServerResponse.schemaJson(CreateUserResponse)(response, {
    status: 201,
  });
}).pipe(
  HttpServerRequest.withMaxBodySize(Option.some(FileSystem.KiB(4))),
  Effect.catchTags({
    SignupRateLimited: () =>
      HttpServerResponse.json({ error: "too_many_requests" }, { status: 429 }),
    InvalidSignup: () =>
      HttpServerResponse.json({ error: "invalid_request" }, { status: 400 }),
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
