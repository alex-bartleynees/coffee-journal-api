import { HttpServerRequest, HttpServerResponse } from "@effect/platform";
import { Effect } from "effect";
import { Auth } from "../../shared/auth.js";
import { SyncRequest, SyncResponse } from "./contract.js";
import { authorizeSync, synchronize } from "./use-case.js";

const textStatus = (body: string, status: number) =>
  Effect.succeed(
    HttpServerResponse.setStatus(HttpServerResponse.text(body), status),
  );

export const syncEndpoint = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  const auth = yield* Auth;
  const user = yield* auth.user(request.headers);
  yield* authorizeSync(user.userId);
  const body = yield* HttpServerRequest.schemaBodyJson(SyncRequest);
  const response = yield* synchronize(user, body);
  return yield* HttpServerResponse.schemaJson(SyncResponse)(response);
}).pipe(
  Effect.catchTags({
    AuthError: (error) => textStatus(`Unauthorized: ${error.reason}`, 401),
    SubscriptionRequired: () =>
      HttpServerResponse.json(
        { error: "subscription_required" },
        { status: 403 },
      ),
    ParseError: () => textStatus("Invalid request body", 400),
    RequestError: () => textStatus("Invalid request body", 400),
  }),
  Effect.catchAll((cause) =>
    Effect.zipRight(
      Effect.logError("sync failed", cause),
      textStatus("Internal server error", 500),
    ),
  ),
);
