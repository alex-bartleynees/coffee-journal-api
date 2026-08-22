import { Config, Redacted } from "effect";

/**
 * Service configuration, read from the environment (see `.env.example`).
 * Defaults are dev-friendly so the service boots locally with zero env set.
 */
export const AppConfig = {
  port: Config.integer("PORT").pipe(Config.withDefault(3001)),
  databaseUrl: Config.string("DATABASE_URL").pipe(
    Config.withDefault("postgres://localhost:5432/coffee_journal"),
  ),
  /**
   * Keycloak JWKS endpoint + issuer for verifying access tokens. When JWKS is
   * empty the Auth layer runs in dev mode (see Auth.ts) — real Keycloak wiring
   * lands with Step 3 of the plan.
   */
  jwksUrl: Config.string("KEYCLOAK_JWKS_URL").pipe(Config.withDefault("")),
  issuer: Config.string("KEYCLOAK_ISSUER").pipe(Config.withDefault("")),
  /** Keycloak service-account settings used only by the public signup endpoint. */
  keycloakAdminBaseUrl: Config.string("KEYCLOAK_ADMIN_BASE_URL").pipe(
    Config.withDefault(""),
  ),
  keycloakAdminRealm: Config.string("KEYCLOAK_ADMIN_REALM").pipe(
    Config.withDefault(""),
  ),
  keycloakAdminClientId: Config.string("KEYCLOAK_ADMIN_CLIENT_ID").pipe(
    Config.withDefault("admin-cli"),
  ),
  keycloakAdminClientSecret: Config.string("KEYCLOAK_ADMIN_CLIENT_SECRET").pipe(
    Config.withDefault(""),
  ),
  /**
   * AMQP connection string for the entitlement consumer. Empty = consumer
   * disabled (sync still runs; the entitlement gate then only ever sees
   * whatever is already in the local read-model — fail-closed).
   */
  rabbitMqUrl: Config.string("RABBITMQ_URL").pipe(Config.withDefault("")),
  s3Endpoint: Config.string("S3_ENDPOINT").pipe(Config.withDefault("")),
  s3Region: Config.string("S3_REGION").pipe(Config.withDefault("")),
  s3Bucket: Config.string("S3_BUCKET").pipe(Config.withDefault("")),
  s3AccessKeyId: Config.string("S3_ACCESS_KEY_ID").pipe(Config.withDefault("")),
  s3SecretAccessKey: Config.string("S3_SECRET_ACCESS_KEY").pipe(
    Config.withDefault(""),
  ),
  /** Path-style addressing is useful for S3-compatible local/test services;
   * Backblaze production keeps the default virtual-hosted addressing. */
  s3ForcePathStyle: Config.boolean("S3_FORCE_PATH_STYLE").pipe(
    Config.withDefault(false),
  ),
  openRouterApiKey: Config.redacted("OPENROUTER_API_KEY").pipe(
    Config.map(Redacted.value),
    Config.withDefault(""),
  ),
  beanExtractionModel: Config.string("AI_BEAN_EXTRACTION_MODEL").pipe(
    Config.withDefault("google/gemini-2.5-flash-lite"),
  ),
};

/** Our slug in the shared multi-tenant Payments.Gateway. */
export const PRODUCT_ID = "coffee_journal";
