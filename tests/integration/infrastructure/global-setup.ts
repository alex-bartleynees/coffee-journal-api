import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3";
import {
  MinioContainer,
  type StartedMinioContainer,
} from "@testcontainers/minio";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import {
  RabbitMQContainer,
  type StartedRabbitMQContainer,
} from "@testcontainers/rabbitmq";
import { afterAll, beforeAll } from "vitest";

const POSTGRES_IMAGE = "postgres:17";
const MINIO_IMAGE = "minio/minio:RELEASE.2025-07-23T15-54-02Z";
const RABBITMQ_IMAGE = "rabbitmq:3-management";
const PHOTO_BUCKET = "bloom-integration-photos";
const STARTUP_TIMEOUT_MS = 30_000;

let database: StartedPostgreSqlContainer | undefined;
let objectStorage: StartedMinioContainer | undefined;
let rabbitMq: StartedRabbitMQContainer | undefined;
let api: ChildProcess | undefined;
let apiBaseUrl: string | undefined;

const availablePort = () =>
  new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address == null || typeof address === "string") {
        server.close();
        reject(new Error("Could not allocate an integration-test port"));
        return;
      }
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });

const waitForApi = async (
  api: ChildProcess,
  baseUrl: string,
  output: () => string,
) => {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (api.exitCode != null)
      throw new Error(
        `API exited during startup (${api.exitCode})\n${output()}`,
      );
    try {
      const response = await fetch(`${baseUrl}/health`, {
        signal: AbortSignal.timeout(1_000),
      });
      if (response.ok) return;
    } catch {
      // The server has not bound its socket yet.
    }
    await delay(100);
  }
  throw new Error(`API did not become healthy\n${output()}`);
};

const stopProcess = async (process: ChildProcess) => {
  if (process.exitCode != null) return;
  process.kill("SIGTERM");
  await Promise.race([
    new Promise<void>((resolve) => process.once("exit", () => resolve())),
    delay(5_000).then(() => {
      if (process.exitCode == null) process.kill("SIGKILL");
    }),
  ]);
};

const setup = async () => {
  [database, objectStorage, rabbitMq] = await Promise.all([
    new PostgreSqlContainer(POSTGRES_IMAGE)
      .withDatabase("coffee_journal")
      .start(),
    new MinioContainer(MINIO_IMAGE).start(),
    new RabbitMQContainer(RABBITMQ_IMAGE).start(),
  ]);

  const s3 = new S3Client({
    endpoint: objectStorage.getConnectionUrl(),
    region: "us-east-1",
    forcePathStyle: true,
    credentials: {
      accessKeyId: objectStorage.getUsername(),
      secretAccessKey: objectStorage.getPassword(),
    },
  });
  await s3.send(new CreateBucketCommand({ Bucket: PHOTO_BUCKET }));
  s3.destroy();

  const port = await availablePort();
  apiBaseUrl = `http://127.0.0.1:${port}`;
  let apiOutput = "";
  api = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_URL: database.getConnectionUri(),
      KEYCLOAK_JWKS_URL: "",
      KEYCLOAK_ISSUER: "",
      RABBITMQ_URL: rabbitMq.getAmqpUrl(),
      S3_ENDPOINT: objectStorage.getConnectionUrl(),
      S3_REGION: "us-east-1",
      S3_BUCKET: PHOTO_BUCKET,
      S3_ACCESS_KEY_ID: objectStorage.getUsername(),
      S3_SECRET_ACCESS_KEY: objectStorage.getPassword(),
      S3_FORCE_PATH_STYLE: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  api.stdout?.on("data", (chunk: Buffer) => {
    apiOutput += chunk.toString();
  });
  api.stderr?.on("data", (chunk: Buffer) => {
    apiOutput += chunk.toString();
  });

  try {
    await waitForApi(api, apiBaseUrl, () => apiOutput);
  } catch (error) {
    console.error("[integration] API startup failed", error, apiOutput);
    await stopProcess(api);
    await Promise.all([database.stop(), objectStorage.stop(), rabbitMq.stop()]);
    throw error;
  }
};

const teardown = async () => {
  if (api != null) await stopProcess(api);
  await Promise.all([
    database?.stop(),
    objectStorage?.stop(),
    rabbitMq?.stop(),
  ]);
};

export const registerIntegrationInfrastructure = () => {
  beforeAll(setup, 60_000);
  afterAll(teardown, 60_000);
};

export const integrationContext = () => {
  if (apiBaseUrl == null || database == null || rabbitMq == null) {
    throw new Error("Integration infrastructure has not started");
  }
  return {
    apiBaseUrl,
    databaseUrl: database.getConnectionUri(),
    rabbitMqUrl: rabbitMq.getAmqpUrl(),
  };
};
