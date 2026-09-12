import { HttpServerResponse } from "@effect/platform";
import { Effect } from "effect";
import { McpFacade } from "./facade.js";
import { parseMcpRequest } from "./request.js";
import { encodeMcpResponse } from "./response.js";

export const mcpEndpoint = Effect.gen(function* () {
  const request = yield* parseMcpRequest;
  const facade = yield* McpFacade;
  const response = yield* Effect.tryPromise(() => facade.handle(request));
  return encodeMcpResponse(response);
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
