import { Config, Effect, Redacted } from "effect";

export const KeycloakAdminConfig = Effect.gen(function* () {
  const clientSecret = yield* Config.Redacted(
    "KEYCLOAK_ADMIN_CLIENT_SECRET",
  ).pipe(Config.withDefault(Redacted.make("")));
  if (Redacted.value(clientSecret).trim() === "") {
    return { enabled: false } as const;
  }

  return {
    enabled: true,
    baseUrl: yield* Config.URL("KEYCLOAK_ADMIN_BASE_URL"),
    realm: yield* Config.NonEmptyString("KEYCLOAK_ADMIN_REALM"),
    clientId: yield* Config.NonEmptyString("KEYCLOAK_ADMIN_CLIENT_ID").pipe(
      Config.withDefault("admin-cli"),
    ),
    clientSecret,
  } as const;
});
