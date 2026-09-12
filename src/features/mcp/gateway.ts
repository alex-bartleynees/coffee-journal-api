import { Context, Effect, Layer } from "effect";
import {
  createMcpHandler,
  getOAuthProtectedResourceMetadataUrl,
  McpServer,
  OAuthError,
  OAuthErrorCode,
  requireBearerAuth,
  type AuthInfo,
  type OAuthTokenVerifier,
} from "@modelcontextprotocol/server";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { AppConfig } from "../../config.js";
import { McpAccessGrantRepository } from "./access-grants/repository.js";

const SERVER_NAME = "coffee-journal";
const SERVER_VERSION = "0.1.0";

export interface McpGatewayService {
  readonly handle: (request: Request) => Promise<Response>;
}

export class McpGateway extends Context.Tag("McpGateway")<
  McpGateway,
  McpGatewayService
>() {}

const disabledGateway: McpGatewayService = {
  handle: () => Promise.resolve(new Response("Not Found", { status: 404 })),
};

const required = (name: string, value: string): string => {
  if (value.trim() === "") {
    throw new Error(`${name} must be set when MCP_ENABLED=true`);
  }
  return value;
};

const scopesFrom = (claim: unknown): string[] =>
  typeof claim === "string"
    ? claim.split(" ").filter((scope) => scope !== "")
    : [];

const invalidToken = (): OAuthError =>
  new OAuthError(OAuthErrorCode.InvalidToken, "Invalid access token");

export const McpGatewayLive = Layer.scoped(
  McpGateway,
  Effect.gen(function* () {
    const enabled = yield* AppConfig.mcpEnabled;
    if (!enabled) {
      return disabledGateway;
    }

    const accessGrants = yield* McpAccessGrantRepository;
    const jwksUrl = required("KEYCLOAK_JWKS_URL", yield* AppConfig.jwksUrl);
    const issuer = required("KEYCLOAK_ISSUER", yield* AppConfig.issuer);
    const resourceUrl = new URL(
      required("MCP_RESOURCE_URL", yield* AppConfig.mcpResourceUrl),
    );
    const localResource = ["localhost", "127.0.0.1", "[::1]"].includes(
      resourceUrl.hostname,
    );
    if (resourceUrl.protocol !== "https:" && !localResource) {
      return yield* Effect.dieMessage(
        "MCP_RESOURCE_URL must use HTTPS outside local development",
      );
    }
    const audience = required("MCP_AUDIENCE", yield* AppConfig.mcpAudience);
    const requiredScope = required(
      "MCP_REQUIRED_SCOPE",
      yield* AppConfig.mcpRequiredScope,
    );

    const jwks = createRemoteJWKSet(new URL(jwksUrl));
    const verifier: OAuthTokenVerifier = {
      verifyAccessToken: async (token) => {
        try {
          const { payload } = await jwtVerify(token, jwks, {
            issuer,
            audience,
          });
          if (
            typeof payload.sub !== "string" ||
            typeof payload.exp !== "number"
          ) {
            throw invalidToken();
          }

          const clientId =
            typeof payload.azp === "string"
              ? payload.azp
              : typeof payload.client_id === "string"
                ? payload.client_id
                : "unknown";
          return {
            token,
            clientId,
            scopes: scopesFrom(payload.scope),
            expiresAt: payload.exp,
            resource: resourceUrl,
            extra: { userId: payload.sub },
          } satisfies AuthInfo;
        } catch (error) {
          if (error instanceof OAuthError) throw error;
          throw invalidToken();
        }
      },
    };

    const resourceMetadataUrl =
      getOAuthProtectedResourceMetadataUrl(resourceUrl);
    const authorize = requireBearerAuth({
      verifier,
      requiredScopes: [requiredScope],
      resourceMetadataUrl,
    });
    const handler = createMcpHandler(
      ({ authInfo }) => {
        if (authInfo == null) throw invalidToken();
        return new McpServer(
          { name: SERVER_NAME, version: SERVER_VERSION },
          {
            instructions:
              "Read-only access to the authenticated user's coffee journal. No tools are available during the transport scaffold phase.",
          },
        );
      },
      { legacy: "stateless", responseMode: "json" },
    );
    yield* Effect.addFinalizer(() => Effect.promise(() => handler.close()));

    return {
      handle: async (request) => {
        const auth = await authorize(request);
        if (auth instanceof Response) {
          // The request was unauthorized or forbidden, so return the error response directly.
          return auth;
        }

        const userId = auth.extra?.userId;

        if (typeof userId !== "string") {
          return Response.json({ error: "access_denied" }, { status: 403 });
        }

        const allowed = await Effect.runPromise(accessGrants.hasAccess(userId));

        if (!allowed) {
          return Response.json({ error: "Access denied" }, { status: 403 });
        }

        return handler.fetch(request, { authInfo: auth });
      },
    } satisfies McpGatewayService;
  }),
);
