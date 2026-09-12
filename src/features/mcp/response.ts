import { HttpServerResponse } from "@effect/platform";

export type McpResponse = Response;

export const encodeMcpResponse = (response: McpResponse) =>
  HttpServerResponse.fromWeb(response);
