import { HttpRouter } from "@effect/platform";
import { mcpEndpoint } from "./endpoint.js";
import { protectedResourceMetadataEndpoint } from "./protected-resource-metadata/endpoint.js";

export const mcpRouter = HttpRouter.empty.pipe(
  HttpRouter.get(
    "/.well-known/oauth-protected-resource/mcp",
    protectedResourceMetadataEndpoint,
  ),
  HttpRouter.all("/mcp", mcpEndpoint),
);
