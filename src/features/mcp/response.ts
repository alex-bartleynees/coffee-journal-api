import { HttpServerResponse } from "effect/http";

export type McpResponse = Response;

export const encodeMcpResponse = (response: McpResponse) =>
  HttpServerResponse.fromWeb(response);
