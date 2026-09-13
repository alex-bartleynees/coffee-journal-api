import { HttpServerResponse } from "@effect/platform";
import { Effect } from "effect";
import { McpConfig } from "../config.js";
import { ProtectedResourceMetadataResponse } from "./response.js";

export const protectedResourceMetadataEndpoint = Effect.gen(function* () {
  const settings = yield* McpConfig;
  if (!settings.enabled) {
    return HttpServerResponse.setStatus(
      HttpServerResponse.text("Not Found"),
      404,
    );
  }

  const response = {
    resource: settings.resourceUrl.href,
    authorization_servers: [settings.issuer],
    scopes_supported: [settings.requiredScope],
    resource_name: "Coffee Journal MCP",
  } satisfies ProtectedResourceMetadataResponse;

  return yield* HttpServerResponse.schemaJson(ProtectedResourceMetadataResponse)(
    response,
  );
});

