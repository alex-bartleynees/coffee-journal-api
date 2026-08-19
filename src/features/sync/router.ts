import { HttpRouter } from "@effect/platform";
import { syncEndpoint } from "./endpoint.js";

export const syncRouter = HttpRouter.empty.pipe(
  HttpRouter.post("/sync", syncEndpoint),
  // The BFF preserves /api/* paths, while direct legacy clients use /sync.
  HttpRouter.post("/api/sync", syncEndpoint),
);
