import { HttpRouter } from "@effect/platform";
import { mcpEndpoint } from "./endpoint.js";

export const mcpRouter = HttpRouter.empty.pipe(
  HttpRouter.all("/mcp", mcpEndpoint),
);
