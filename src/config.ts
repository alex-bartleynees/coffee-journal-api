import { Config } from 'effect';

/**
 * Service configuration, read from the environment (see `.env.example`).
 * Defaults are dev-friendly so the service boots locally with zero env set.
 */
export const AppConfig = {
	port: Config.integer('PORT').pipe(Config.withDefault(3001)),
	databaseUrl: Config.string('DATABASE_URL').pipe(
		Config.withDefault('postgres://localhost:5432/coffee_journal')
	),
	/**
	 * Keycloak JWKS endpoint + issuer for verifying access tokens. When JWKS is
	 * empty the Auth layer runs in dev mode (see Auth.ts) — real Keycloak wiring
	 * lands with Step 3 of the plan.
	 */
	jwksUrl: Config.string('KEYCLOAK_JWKS_URL').pipe(Config.withDefault('')),
	issuer: Config.string('KEYCLOAK_ISSUER').pipe(Config.withDefault(''))
};
