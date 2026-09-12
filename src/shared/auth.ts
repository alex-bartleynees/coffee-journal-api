import { Context, Data, Effect, Layer, Schema } from "effect";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Headers } from "@effect/platform";
import { AuthConfig } from "./auth-config.js";

export class AuthError extends Data.TaggedError("AuthError")<{
  readonly reason: string;
}> {}

export type AuthUser = {
  readonly userId: string;
  readonly email: string | null;
};

export interface AuthService {
  /** Resolve the authenticated user (Keycloak `sub` + email claim) from request headers. */
  readonly user: (
    headers: Headers.Headers,
  ) => Effect.Effect<AuthUser, AuthError>;
}

export class Auth extends Context.Tag("Auth")<Auth, AuthService>() {}

const AccessTokenClaims = Schema.Struct({
  sub: Schema.String,
  email: Schema.optional(Schema.String),
});

function bearer(headers: Headers.Headers): string | null {
  const raw = headers["authorization"] ?? headers["Authorization"];
  if (!raw) {
    return null;
  }
  const [scheme, token] = raw.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

export const AuthLive = Layer.effect(
  Auth,
  Effect.gen(function* () {
    const settings = yield* AuthConfig;

    const jwks = createRemoteJWKSet(settings.jwksUrl);
    return {
      user: (headers) =>
        Effect.gen(function* () {
          const token = bearer(headers);
          if (!token) {
            return yield* new AuthError({ reason: "missing bearer token" });
          }
          const { payload } = yield* Effect.tryPromise({
            try: () => jwtVerify(token, jwks, { issuer: settings.issuer }),
            catch: (e) =>
              new AuthError({ reason: `invalid token: ${String(e)}` }),
          });
          const claims = yield* Schema.decodeUnknown(AccessTokenClaims)(
            payload,
          ).pipe(
            Effect.mapError(
              (error) =>
                new AuthError({ reason: `invalid token claims: ${error}` }),
            ),
          );
          return {
            userId: claims.sub,
            email: claims.email ?? null,
          };
        }),
    } satisfies AuthService;
  }),
);
