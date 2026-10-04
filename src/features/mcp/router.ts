import { HttpRouter } from "effect/http";
import { mcpEndpoint } from "./endpoint.js";
import { protectedResourceMetadataEndpoint } from "./protected-resource-metadata/endpoint.js";

export const mcpRouter = HttpRouter.addAll([
  HttpRouter.route(
    "GET",
    "/.well-known/oauth-protected-resource/mcp",
    protectedResourceMetadataEndpoint,
  ),
  HttpRouter.route("*", "/mcp", mcpEndpoint),
]);
