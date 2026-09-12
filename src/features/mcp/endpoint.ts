import { HttpServerRequest, HttpServerResponse } from "@effect/platform";
import { Effect } from "effect";
import { McpGateway } from "./gateway.js";

export const mcpEndpoint = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  const gateway = yield* McpGateway;
  const webRequest = yield* HttpServerRequest.toWeb(request);
  const response = yield* Effect.tryPromise(() => gateway.handle(webRequest));
  return HttpServerResponse.fromWeb(response);
}).pipe(
  Effect.catchAll((cause) =>
    Effect.zipRight(
      Effect.logError("mcp request failed", cause),
      Effect.succeed(
        HttpServerResponse.setStatus(
          HttpServerResponse.text("Internal server error"),
          500,
        ),
      ),
    ),
  ),
);
