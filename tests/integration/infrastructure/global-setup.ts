import { spawn, type ChildProcess } from "node:child_process";
import { generateKeyPairSync, sign } from "node:crypto";
import { createServer as createHttpServer, type Server } from "node:http";
import { createServer as createTcpServer } from "node:net";
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
const MINIO_IMAGE = "quay.io/minio/minio:RELEASE.2025-07-23T15-54-02Z";
const RABBITMQ_IMAGE = "rabbitmq:3-management";
const PHOTO_BUCKET = "bloom-integration-photos";
const STARTUP_TIMEOUT_MS = 30_000;
const JWT_KEY_ID = "integration-test-key";
const { privateKey: jwtPrivateKey, publicKey: jwtPublicKey } =
  generateKeyPairSync("rsa", { modulusLength: 2048 });
const publicJwk = {
  ...jwtPublicKey.export({ format: "jwk" }),
  alg: "RS256",
  kid: JWT_KEY_ID,
  use: "sig",
};

let database: StartedPostgreSqlContainer | undefined;
let objectStorage: StartedMinioContainer | undefined;
let rabbitMq: StartedRabbitMQContainer | undefined;
let api: ChildProcess | undefined;
let apiBaseUrl: string | undefined;
let jwksServer: Server | undefined;
let jwtIssuer: string | undefined;

const availablePort = () =>
  new Promise<number>((resolve, reject) => {
    const server = createTcpServer();
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

const stopServer = (server: Server) =>
  new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );

const accessToken = (
  userId: string,
  options: {
    audience?: string;
    scope?: string;
    clientId?: string;
  } = {},
): string => {
  if (jwtIssuer == null) {
    throw new Error("Integration JWKS server has not started");
  }
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1_000);
  const header = encode({ alg: "RS256", kid: JWT_KEY_ID, typ: "JWT" });
  const payload = encode({
    sub: userId,
    iss: jwtIssuer,
    aud: options.audience,
    scope: options.scope,
    azp: options.clientId,
    iat: now,
    exp: now + 3600,
  });
  const unsignedToken = `${header}.${payload}`;
  const signature = sign(
    "RSA-SHA256",
    Buffer.from(unsignedToken),
    jwtPrivateKey,
  ).toString("base64url");
  return `${unsignedToken}.${signature}`;
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

  const jwksPort = await availablePort();
  jwtIssuer = `http://127.0.0.1:${jwksPort}`;
  jwksServer = createHttpServer((request, response) => {
    if (request.url !== "/jwks") {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ keys: [publicJwk] }));
  });
  await new Promise<void>((resolve, reject) => {
    jwksServer?.once("error", reject);
    jwksServer?.listen(jwksPort, "127.0.0.1", resolve);
  });

  const port = await availablePort();
  apiBaseUrl = `http://127.0.0.1:${port}`;
  let apiOutput = "";
  api = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_URL: database.getConnectionUri(),
      KEYCLOAK_JWKS_URL: `${jwtIssuer}/jwks`,
      KEYCLOAK_ISSUER: jwtIssuer,
      MCP_ENABLED: "true",
      MCP_RESOURCE_URL: `${apiBaseUrl}/mcp`,
      MCP_AUDIENCE: "coffee-journal-mcp",
      MCP_REQUIRED_SCOPE: "coffee-journal:read",
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
    if (jwksServer != null) await stopServer(jwksServer);
    await Promise.all([database.stop(), objectStorage.stop(), rabbitMq.stop()]);
    throw error;
  }
};

const teardown = async () => {
  if (api != null) await stopProcess(api);
  if (jwksServer != null) await stopServer(jwksServer);
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
  if (
    apiBaseUrl == null ||
    database == null ||
    rabbitMq == null ||
    jwtIssuer == null
  ) {
    throw new Error("Integration infrastructure has not started");
  }
  return {
    apiBaseUrl,
    databaseUrl: database.getConnectionUri(),
    rabbitMqUrl: rabbitMq.getAmqpUrl(),
    jwtIssuer,
    accessToken,
  };
};
