import { Context, Data, Effect, Layer } from "effect";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Headers } from "@effect/platform";
import { AppConfig } from "../config.js";

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

function bearer(headers: Headers.Headers): string | null {
  const raw = headers["authorization"] ?? headers["Authorization"];
  if (!raw) return null;
  const [scheme, token] = raw.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

export const AuthLive = Layer.effect(
  Auth,
  Effect.gen(function* () {
    const jwksUrl = yield* AppConfig.jwksUrl;
    const issuer = yield* AppConfig.issuer;

    // Production: verify the Keycloak access token against the realm JWKS.
    if (jwksUrl !== "") {
      const jwks = createRemoteJWKSet(new URL(jwksUrl));
      return {
        user: (headers) =>
          Effect.gen(function* () {
            const token = bearer(headers);
            if (!token)
              return yield* new AuthError({ reason: "missing bearer token" });
            const { payload } = yield* Effect.tryPromise({
              try: () =>
                jwtVerify(token, jwks, issuer !== "" ? { issuer } : undefined),
              catch: (e) =>
                new AuthError({ reason: `invalid token: ${String(e)}` }),
            });
            if (typeof payload.sub !== "string") {
              return yield* new AuthError({ reason: "token has no sub" });
            }
            return {
              userId: payload.sub,
              email: typeof payload.email === "string" ? payload.email : null,
            };
          }),
      } satisfies AuthService;
    }

    // Dev fallback (no JWKS configured): trust an `x-dev-user` header as the
    // user id so sync can be exercised locally before Keycloak is wired up in
    // Step 3. NEVER runs in production — production sets KEYCLOAK_JWKS_URL.
    yield* Effect.logWarning(
      "[auth] KEYCLOAK_JWKS_URL unset — running in DEV mode, trusting x-dev-user header",
    );
    return {
      user: (headers) => {
        const dev = headers["x-dev-user"];
        return dev && dev !== ""
          ? Effect.succeed({ userId: dev, email: null })
          : new AuthError({ reason: "dev mode: missing x-dev-user header" });
      },
    } satisfies AuthService;
  }),
);
