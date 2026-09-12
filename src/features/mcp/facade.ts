import { Context, Effect, Layer } from "effect";
import { AppConfig } from "../../config.js";
import { McpAccessGrantRepository } from "./access-grants/repository.js";
import { createMcpAuthorization } from "./authorization.js";
import { createCoffeeJournalMcpHandler } from "./server.js";
import { createTokenVerifier } from "./token-verifier.js";

export interface McpFacadeService {
  readonly handle: (request: Request) => Promise<Response>;
}

export class McpFacade extends Context.Tag("McpFacade")<
  McpFacade,
  McpFacadeService
>() {}

const disabledFacade: McpFacadeService = {
  handle: () => Promise.resolve(new Response("Not Found", { status: 404 })),
};

const required = (name: string, value: string): string => {
  if (value.trim() === "") {
    throw new Error(`${name} must be set when MCP_ENABLED=true`);
  }
  return value;
};

const validateResourceUrl = (resourceUrl: URL): URL => {
  const localResource = ["localhost", "127.0.0.1", "[::1]"].includes(
    resourceUrl.hostname,
  );
  if (resourceUrl.protocol !== "https:" && !localResource) {
    throw new Error("MCP_RESOURCE_URL must use HTTPS outside local development");
  }
  return resourceUrl;
};

export const McpFacadeLive = Layer.scoped(
  McpFacade,
  Effect.gen(function* () {
    const enabled = yield* AppConfig.mcpEnabled;
    if (!enabled) return disabledFacade;

    const accessGrants = yield* McpAccessGrantRepository;
    const resourceUrl = validateResourceUrl(
      new URL(required("MCP_RESOURCE_URL", yield* AppConfig.mcpResourceUrl)),
    );
    const verifier = createTokenVerifier({
      jwksUrl: new URL(
        required("KEYCLOAK_JWKS_URL", yield* AppConfig.jwksUrl),
      ),
      issuer: required("KEYCLOAK_ISSUER", yield* AppConfig.issuer),
      audience: required("MCP_AUDIENCE", yield* AppConfig.mcpAudience),
      resourceUrl,
    });
    const authorize = createMcpAuthorization({
      verifier,
      requiredScope: required(
        "MCP_REQUIRED_SCOPE",
        yield* AppConfig.mcpRequiredScope,
      ),
      resourceUrl,
      hasAccess: accessGrants.hasAccess,
    });
    const handler = createCoffeeJournalMcpHandler();

    yield* Effect.addFinalizer(() => Effect.promise(() => handler.close()));

    return {
      handle: async (request) => {
        const auth = await authorize(request);
        if (auth instanceof Response) return auth;
        return handler.fetch(request, { authInfo: auth });
      },
    } satisfies McpFacadeService;
  }),
);
