import { Context, Effect, Layer } from "effect";
import { McpAccessGrantRepository } from "./access-grants/repository.js";
import { createMcpAuthorization } from "./authorization.js";
import { createCoffeeJournalMcpHandler } from "./server.js";
import { createTokenVerifier } from "./token-verifier.js";
import { McpConfig } from "./config.js";

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

export const McpFacadeLive = Layer.scoped(
  McpFacade,
  Effect.gen(function* () {
    const settings = yield* McpConfig;
    if (!settings.enabled) return disabledFacade;

    const accessGrants = yield* McpAccessGrantRepository;
    const verifier = createTokenVerifier({
      jwksUrl: settings.jwksUrl,
      issuer: settings.issuer,
      audience: settings.audience,
      resourceUrl: settings.resourceUrl,
    });
    const authorize = createMcpAuthorization({
      verifier,
      requiredScope: settings.requiredScope,
      resourceUrl: settings.resourceUrl,
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
