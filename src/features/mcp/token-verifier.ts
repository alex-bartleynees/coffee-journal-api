import {
  OAuthError,
  OAuthErrorCode,
  type AuthInfo,
  type OAuthTokenVerifier,
} from "@modelcontextprotocol/server";
import { createRemoteJWKSet, jwtVerify } from "jose";

interface TokenVerifierSettings {
  readonly jwksUrl: URL;
  readonly issuer: string;
  readonly audience: string;
  readonly resourceUrl: URL;
}

const scopesFrom = (claim: unknown): string[] =>
  typeof claim === "string"
    ? claim.split(" ").filter((scope) => scope !== "")
    : [];

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
          resource: settings.resourceUrl,
          extra: { userId: payload.sub },
        } satisfies AuthInfo;
      } catch (error) {
        if (error instanceof OAuthError) throw error;
        throw invalidToken();
      }
    },
  };
};
