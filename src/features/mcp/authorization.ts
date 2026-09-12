import {
  getOAuthProtectedResourceMetadataUrl,
  requireBearerAuth,
  type AuthInfo,
  type OAuthTokenVerifier,
} from "@modelcontextprotocol/server";
import { Effect } from "effect";
import type { McpAccessGrantRepositoryService } from "./access-grants/repository.js";

interface McpAuthorizationSettings {
  readonly verifier: OAuthTokenVerifier;
  readonly requiredScope: string;
  readonly resourceUrl: URL;
  readonly hasAccess: McpAccessGrantRepositoryService["hasAccess"];
}

export type AuthorizeMcpRequest = (
  request: Request,
) => Promise<AuthInfo | Response>;

export const createMcpAuthorization = (
  settings: McpAuthorizationSettings,
): AuthorizeMcpRequest => {
  const authorizeBearer = requireBearerAuth({
    verifier: settings.verifier,
    requiredScopes: [settings.requiredScope],
    resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(
      settings.resourceUrl,
    ),
  });

  return async (request) => {
    const auth = await authorizeBearer(request);
    if (auth instanceof Response) {
      // If the request is not authorized, return the error response from the authorization check.
      return auth;
    }

    const userId = auth.extra?.userId;
    if (typeof userId !== "string") {
      return Response.json({ error: "access_denied" }, { status: 403 });
    }

    const allowed = await Effect.runPromise(settings.hasAccess(userId));
    if (!allowed) {
      return Response.json({ error: "access_denied" }, { status: 403 });
    }

    return auth;
  };
};
