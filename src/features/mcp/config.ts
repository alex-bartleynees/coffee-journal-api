import { Config, Effect, Schema } from "effect";

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

const ResourceUrl = Schema.URLFromString.check(
  Schema.makeFilter(
    (url) =>
      url.protocol === "https:" ||
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname),
    { message: "MCP_RESOURCE_URL must use HTTPS outside local development" },
  ),
);

export const McpConfig = Effect.gen(function* () {
  const enabled = yield* Config.Boolean("MCP_ENABLED").pipe(
    Config.withDefault(false),
  );
  if (!enabled) {
    return { enabled: false } as const;
  }

  return {
    enabled: true,
    jwksUrl: yield* Config.URL("KEYCLOAK_JWKS_URL"),
    issuer: yield* Config.NonEmptyString("KEYCLOAK_ISSUER"),
    resourceUrl: yield* Config.schema(ResourceUrl, "MCP_RESOURCE_URL"),
    audience: yield* Config.NonEmptyString("MCP_AUDIENCE"),
    requiredScope: yield* Config.NonEmptyString("MCP_REQUIRED_SCOPE").pipe(
      Config.withDefault("coffee-journal:read"),
    ),
  } satisfies McpSettings;
});
