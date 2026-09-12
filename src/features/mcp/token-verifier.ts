import {
  OAuthError,
  OAuthErrorCode,
  type AuthInfo,
  type OAuthTokenVerifier,
} from "@modelcontextprotocol/server";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { Schema } from "effect";

interface TokenVerifierSettings {
  readonly jwksUrl: URL;
  readonly issuer: string;
  readonly audience: string;
  readonly resourceUrl: URL;
}

const TokenClaims = Schema.Struct({
  sub: Schema.String,
  exp: Schema.Number.pipe(Schema.int(), Schema.positive()),
  scope: Schema.optional(Schema.String),
  azp: Schema.optional(Schema.String),
  client_id: Schema.optional(Schema.String),
});

const scopesFrom = (claim: string | undefined): string[] =>
  claim !== undefined ? claim.split(" ").filter((scope) => scope !== "") : [];

export const invalidToken = (): OAuthError =>
  new OAuthError(OAuthErrorCode.InvalidToken, "Invalid access token");

export const createTokenVerifier = (
  settings: TokenVerifierSettings,
): OAuthTokenVerifier => {
  const jwks = createRemoteJWKSet(settings.jwksUrl);

  return {
    verifyAccessToken: async (token) => {
      try {
        const { payload } = await jwtVerify(token, jwks, {
          issuer: settings.issuer,
          audience: settings.audience,
        });
        const claims = await Schema.decodeUnknownPromise(TokenClaims)(payload);

        const clientId = claims.azp ?? claims.client_id ?? "unknown";

        return {
          token,
          clientId,
          scopes: scopesFrom(claims.scope),
          expiresAt: claims.exp,
          resource: settings.resourceUrl,
          extra: { userId: claims.sub },
        } satisfies AuthInfo;
      } catch (error) {
        if (error instanceof OAuthError) {
          throw error;
        }
        throw invalidToken();
      }
    },
  };
};
