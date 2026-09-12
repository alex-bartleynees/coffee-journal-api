import { HttpServerRequest, HttpServerResponse } from "@effect/platform";
import { Effect } from "effect";
import { McpFacade } from "./facade.js";

export const mcpEndpoint = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  const facade = yield* McpFacade;
  const webRequest = yield* HttpServerRequest.toWeb(request);
  const response = yield* Effect.tryPromise(() => facade.handle(webRequest));
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
