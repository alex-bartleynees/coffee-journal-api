import { Context, Data, Effect, Layer } from "effect";
import { AppConfig } from "../../config.js";

export class KeycloakUnavailableError extends Data.TaggedError(
  "KeycloakUnavailableError",
)<{
  readonly reason: string;
}> {}

export type NewKeycloakUser = {
  readonly name: string;
  readonly email: string;
  readonly password: string;
};

export interface KeycloakService {
  readonly createUser: (
    user: NewKeycloakUser,
  ) => Effect.Effect<"created" | "existing", KeycloakUnavailableError>;
}

export class Keycloak extends Context.Tag("Keycloak")<
  Keycloak,
  KeycloakService
>() {}

type TokenResponse = { access_token?: unknown; expires_in?: unknown };

const fetchWithTimeout = (url: string, init: RequestInit) =>
  fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });

export const KeycloakLive = Layer.effect(
  Keycloak,
  Effect.gen(function* () {
    const baseUrl = (yield* AppConfig.keycloakAdminBaseUrl).replace(/\/$/, "");
    const realm = yield* AppConfig.keycloakAdminRealm;
    const clientId = yield* AppConfig.keycloakAdminClientId;
    const clientSecret = yield* AppConfig.keycloakAdminClientSecret;

    let accessToken = "";
    let tokenExpiresAt = 0;

    const token = Effect.tryPromise({
      try: async () => {
        if (baseUrl === "" || realm === "" || clientSecret === "") {
          throw new Error("Keycloak signup service is not configured");
        }
        if (accessToken !== "" && Date.now() < tokenExpiresAt)
          return accessToken;

        const response = await fetchWithTimeout(
          `${baseUrl}/realms/${encodeURIComponent(realm)}/protocol/openid-connect/token`,
          {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              grant_type: "client_credentials",
              client_id: clientId,
              client_secret: clientSecret,
            }),
          },
        );
        if (!response.ok)
          throw new Error(`service token request returned ${response.status}`);

        const body = (await response.json()) as TokenResponse;
        if (typeof body.access_token !== "string")
          throw new Error("service token response was invalid");
        const expiresIn =
          typeof body.expires_in === "number" ? body.expires_in : 60;
        accessToken = body.access_token;
        tokenExpiresAt = Date.now() + Math.max(1, expiresIn - 30) * 1000;
        return accessToken;
      },
      catch: (cause) => new KeycloakUnavailableError({ reason: String(cause) }),
    });

    const createUser: KeycloakService["createUser"] = (user) =>
      Effect.gen(function* () {
        const bearer = yield* token;
        const normalizedName = user.name.trim().replace(/\s+/g, " ");
        const firstSpace = normalizedName.indexOf(" ");
        const firstName =
          firstSpace === -1
            ? normalizedName
            : normalizedName.slice(0, firstSpace);
        const lastName =
          firstSpace === -1 ? "" : normalizedName.slice(firstSpace + 1);
        const endpoint = `${baseUrl}/admin/realms/${encodeURIComponent(realm)}/users`;

        // The lookup improves the common existing-account response. Creation's 409
        // remains authoritative when concurrent requests race.
        const search = yield* Effect.tryPromise<
          Response,
          KeycloakUnavailableError
        >({
          try: () =>
            fetchWithTimeout(
              `${endpoint}?email=${encodeURIComponent(user.email)}&exact=true`,
              {
                headers: { authorization: `Bearer ${bearer}` },
              },
            ),
          catch: (cause) =>
            new KeycloakUnavailableError({ reason: String(cause) }),
        });
        if (!search.ok) {
          return yield* new KeycloakUnavailableError({
            reason: `user lookup returned ${search.status}`,
          });
        }
        const matches = (yield* Effect.tryPromise({
          try: () => search.json() as Promise<unknown>,
          catch: (cause) =>
            new KeycloakUnavailableError({ reason: String(cause) }),
        })) as unknown;
        if (Array.isArray(matches) && matches.length > 0)
          return "existing" as const;

        const response = yield* Effect.tryPromise({
          try: () =>
            fetchWithTimeout(endpoint, {
              method: "POST",
              headers: {
                authorization: `Bearer ${bearer}`,
                "content-type": "application/json",
              },
              body: JSON.stringify({
                username: user.email,
                email: user.email,
                firstName,
                lastName,
                enabled: true,
                emailVerified: false,
                credentials: [
                  { type: "password", value: user.password, temporary: false },
                ],
              }),
            }),
          catch: (cause) =>
            new KeycloakUnavailableError({ reason: String(cause) }),
        });

        // A concurrent request may create the identity after our lookup. Treat
        // that exactly like the normal existing-user path: login still proves
        // knowledge of the existing account's password.
        if (response.status === 409) return "existing" as const;
        if (response.status !== 201) {
          return yield* new KeycloakUnavailableError({
            reason: `user creation returned ${response.status}`,
          });
        }
        return "created" as const;
      });

    return { createUser } satisfies KeycloakService;
  }),
);
