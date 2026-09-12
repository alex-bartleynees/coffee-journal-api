import { Config } from "effect";
import { BeanExtractionConfig } from "./features/ai/bean-extraction/config.js";
import { EntitlementConsumerConfig } from "./features/entitlements/config.js";
import { McpConfig } from "./features/mcp/config.js";
import { PhotoStorageConfig } from "./features/photos/storage-config.js";
import { KeycloakAdminConfig } from "./features/users/keycloak-config.js";
import { AuthConfig } from "./shared/auth-config.js";
import { DatabaseUrl } from "./shared/persistence/config.js";
import { TelemetryConfig } from "./telemetry-config.js";

export const AppConfig = {
  server: {
    port: Config.port("PORT").pipe(Config.withDefault(3001)),
  },
  auth: AuthConfig,
  database: { url: DatabaseUrl },
  keycloakAdmin: KeycloakAdminConfig,
  photoStorage: PhotoStorageConfig,
  entitlementConsumer: EntitlementConsumerConfig,
  beanExtraction: BeanExtractionConfig,
  mcp: McpConfig,
  telemetry: TelemetryConfig,
} as const;
