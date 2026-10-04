import { HttpRouter } from "effect/http";
import { beanExtractionEndpoint } from "./bean-extraction/endpoint.js";

export const aiRouter = HttpRouter.add(
  "POST",
  "/api/ai/bean-extraction",
  beanExtractionEndpoint,
);
