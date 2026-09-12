import { Config, Effect } from "effect";

export const TelemetryConfig = Effect.gen(function* () {
  const endpoint = yield* Config.string("OTEL_EXPORTER_OTLP_ENDPOINT").pipe(
    Config.withDefault(""),
  );
  if (endpoint.trim() === "") return { enabled: false } as const;

  return {
    enabled: true,
    endpoint: yield* Config.url("OTEL_EXPORTER_OTLP_ENDPOINT"),
    serviceVersion: yield* Config.nonEmptyString("OTEL_SERVICE_VERSION").pipe(
      Config.withDefault("0.0.1"),
    ),
    instanceId: yield* Config.nonEmptyString("HOSTNAME").pipe(
      Config.withDefault(String(process.pid)),
    ),
    deploymentEnvironment: yield* Config.nonEmptyString("NODE_ENV").pipe(
      Config.withDefault("development"),
    ),
  } as const;
});
