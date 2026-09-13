import { Context, Effect, Layer } from "effect";
import { JournalReadRepository } from "../journal-read/repository.js";
import { McpAccessGrantRepository } from "./access-grants/repository.js";
import { createMcpAuthorization } from "./authorization.js";
import { createCoffeeJournalMcpHandler } from "./server.js";
import { createTokenVerifier } from "./token-verifier.js";
import { McpConfig } from "./config.js";
import type { McpRequest } from "./request.js";
import type { McpResponse } from "./response.js";

export interface McpFacadeService {
  readonly handle: (request: McpRequest) => Promise<McpResponse>;
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
    const journalRead = yield* JournalReadRepository;
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
    const handler = createCoffeeJournalMcpHandler({
      listBrews: journalRead.listBrews,
      getBrew: journalRead.getBrew,
      listBeans: journalRead.listBeans,
      getSummary: journalRead.getSummary,
      searchNotes: journalRead.searchNotes,
    });

    yield* Effect.addFinalizer(() => Effect.promise(() => handler.close()));

    return {
      handle: async (request) => {
        const auth = await authorize(request);
        if (auth instanceof Response) {
          // The request was unauthorized or invalid, so we return the response directly.
          return auth;
        }
        return handler.fetch(request, { authInfo: auth });
      },
    } satisfies McpFacadeService;
  }),
);
