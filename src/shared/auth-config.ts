import { Config } from "effect";

export const AuthConfig = Config.all({
  jwksUrl: Config.URL("KEYCLOAK_JWKS_URL"),
  issuer: Config.NonEmptyString("KEYCLOAK_ISSUER"),
});
