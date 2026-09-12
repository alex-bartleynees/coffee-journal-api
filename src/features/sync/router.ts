import { HttpRouter } from "@effect/platform";
import { syncEndpoint } from "./endpoint.js";

export const syncRouter = HttpRouter.empty.pipe(
  HttpRouter.post("/api/sync", syncEndpoint),
);
