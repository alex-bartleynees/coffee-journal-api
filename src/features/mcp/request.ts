import { HttpServerRequest } from "effect/http";
import { Effect } from "effect";

export type McpRequest = Request;

export const parseMcpRequest = Effect.gen(function* () {
  const httpRequest = yield* HttpServerRequest.HttpServerRequest;
  return yield* HttpServerRequest.toWeb(httpRequest);
});
