import { Config } from "effect";

export const AuthConfig = Config.all({
  jwksUrl: Config.url("KEYCLOAK_JWKS_URL"),
  issuer: Config.nonEmptyString("KEYCLOAK_ISSUER"),
});
