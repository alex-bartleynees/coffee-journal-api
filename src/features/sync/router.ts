import { HttpRouter } from "effect/http";
import { syncEndpoint } from "./endpoint.js";

export const syncRouter = HttpRouter.add("POST", "/api/sync", syncEndpoint);
