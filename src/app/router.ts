import { HttpRouter, HttpServerResponse } from "effect/http";
import { Effect, Layer } from "effect";
import { aiRouter } from "../features/ai/router.js";
import { mcpRouter } from "../features/mcp/router.js";
import { photosRouter } from "../features/photos/router.js";
import { syncRouter } from "../features/sync/router.js";
import { usersRouter } from "../features/users/router.js";

export const router = Layer.mergeAll(
  aiRouter,
  mcpRouter,
  photosRouter,
  syncRouter,
  usersRouter,
  HttpRouter.add(
    "GET",
    "/health",
    Effect.succeed(HttpServerResponse.text("ok")),
  ),
);
