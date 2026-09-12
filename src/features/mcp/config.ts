import { Config, Effect } from "effect";

type McpSettings =
  | { readonly enabled: false }
  | {
      readonly enabled: true;
      readonly jwksUrl: URL;
      readonly issuer: string;
      readonly resourceUrl: URL;
      readonly audience: string;
      readonly requiredScope: string;
    };

const resourceUrl = Config.url("MCP_RESOURCE_URL").pipe(
  Config.validate({
    message: "MCP_RESOURCE_URL must use HTTPS outside local development",
    validation: (url) =>
      url.protocol === "https:" ||
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname),
  }),
);

export const McpConfig = Effect.gen(function* () {
  const enabled = yield* Config.boolean("MCP_ENABLED").pipe(
    Config.withDefault(false),
  );
  if (!enabled) return { enabled: false } as const;

  return {
    enabled: true,
    jwksUrl: yield* Config.url("KEYCLOAK_JWKS_URL"),
    issuer: yield* Config.nonEmptyString("KEYCLOAK_ISSUER"),
    resourceUrl: yield* resourceUrl,
    audience: yield* Config.nonEmptyString("MCP_AUDIENCE"),
    requiredScope: yield* Config.nonEmptyString("MCP_REQUIRED_SCOPE").pipe(
      Config.withDefault("coffee-journal:read"),
    ),
  } satisfies McpSettings;
});
