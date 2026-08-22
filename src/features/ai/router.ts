import { HttpRouter } from "@effect/platform";
import { beanExtractionEndpoint } from "./bean-extraction/endpoint.js";

export const aiRouter = HttpRouter.empty.pipe(
  HttpRouter.post("/api/ai/bean-extraction", beanExtractionEndpoint),
);
