import { createServer } from "node:http";
import { HttpMiddleware, HttpServer } from "@effect/platform";
import { NodeHttpServer } from "@effect/platform-node";
import { Layer } from "effect";
import { AppConfig } from "../config.js";
import { EntitlementConsumerLive } from "../features/entitlements/consumer.js";
import { EntitlementRepositoryLive } from "../features/entitlements/postgres-repository.js";
import { PhotoRepositoryLive } from "../features/photos/postgres-repository.js";
import { PhotoStorageLive } from "../features/photos/storage.js";
import { SyncRepositoryLive } from "../features/sync/postgres-repository.js";
import { UserRepositoryLive } from "../features/users/postgres-repository.js";
import { KeycloakLive } from "../features/users/keycloak.js";
import { AuthLive } from "../shared/auth.js";
import { PostgresLive } from "../shared/persistence/Postgres.js";
import { router } from "./router.js";

const ServerLive = NodeHttpServer.layerConfig(() => createServer(), {
  port: AppConfig.port,
});

const PersistenceLive = Layer.mergeAll(
  EntitlementRepositoryLive,
  PhotoRepositoryLive,
  SyncRepositoryLive,
  UserRepositoryLive,
).pipe(Layer.provide(PostgresLive));

export const AppLive = router.pipe(
  HttpServer.serve(
    HttpMiddleware.cors({
      allowedOrigins: ["*"],
      allowedMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: [
        "content-type",
        "authorization",
        "x-dev-user",
        "x-photo-updated-at",
      ],
    }),
  ),
  HttpServer.withLogAddress,
  Layer.merge(EntitlementConsumerLive),
  Layer.provide(KeycloakLive),
  Layer.provide(PersistenceLive),
  Layer.provide(AuthLive),
  Layer.provide(PhotoStorageLive),
  Layer.provide(ServerLive),
);
