import { createServer } from "node:http";
import { HttpMiddleware, HttpRouter } from "effect/http";
import { NodeHttpServer } from "@effect/platform-node";
import { Layer } from "effect";
import { AppConfig } from "../config.js";
import { BeanExtractorLive } from "../features/ai/bean-extraction/extractor.js";
import { EntitlementConsumerLive } from "../features/entitlements/consumer.js";
import { EntitlementRepositoryLive } from "../features/entitlements/postgres-repository.js";
import { JournalReadRepositoryLive } from "../features/journal-read/postgres-repository.js";
import { McpFacadeLive } from "../features/mcp/facade.js";
import { PhotoRepositoryLive } from "../features/photos/postgres-repository.js";
import { PhotoStorageLive } from "../features/photos/storage.js";
import { SyncRepositoryLive } from "../features/sync/postgres-repository.js";
import { UserRepositoryLive } from "../features/users/postgres-repository.js";
import { KeycloakLive } from "../features/users/keycloak.js";
import { AuthLive } from "../shared/auth.js";
import { PostgresLive } from "../shared/persistence/Postgres.js";
import { TelemetryLive } from "../telemetry.js";
import { router } from "./router.js";
import { McpAccessGrantRepositoryLive } from "../features/mcp/access-grants/postgres-repository.js";

const ServerLive = NodeHttpServer.layerConfig(() => createServer(), {
  port: AppConfig.server.port,
});

const PersistenceLive = Layer.mergeAll(
  EntitlementRepositoryLive,
  JournalReadRepositoryLive,
  PhotoRepositoryLive,
  SyncRepositoryLive,
  UserRepositoryLive,
  McpAccessGrantRepositoryLive,
).pipe(Layer.provide(PostgresLive));

const CorsLive = HttpRouter.cors({
  allowedOrigins: ["*"],
  allowedMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["content-type", "authorization", "x-photo-updated-at"],
});

export const AppLive = HttpRouter.serve(router.pipe(Layer.provide(CorsLive)), {
  disableLogger: true,
}).pipe(
  Layer.merge(EntitlementConsumerLive),
  Layer.provide(KeycloakLive),
  Layer.provide(McpFacadeLive),
  Layer.provide(PersistenceLive),
  Layer.provide(AuthLive),
  Layer.provide(PhotoStorageLive),
  Layer.provide(BeanExtractorLive),
  Layer.provide(ServerLive),
  Layer.provide(HttpMiddleware.layerTracerDisabledForUrls(["/health"])),
  Layer.provide(TelemetryLive),
);
