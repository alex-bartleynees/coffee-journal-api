import { Config, Effect } from "effect";

export const TelemetryConfig = Effect.gen(function* () {
  const endpoint = yield* Config.String("OTEL_EXPORTER_OTLP_ENDPOINT").pipe(
    Config.withDefault(""),
  );
  if (endpoint.trim() === "") {
    return { enabled: false } as const;
  }
  return {
    enabled: true,
    endpoint: yield* Config.URL("OTEL_EXPORTER_OTLP_ENDPOINT"),
    serviceVersion: yield* Config.NonEmptyString("OTEL_SERVICE_VERSION").pipe(
      Config.withDefault("0.0.1"),
    ),
    instanceId: yield* Config.NonEmptyString("HOSTNAME").pipe(
      Config.withDefault(String(process.pid)),
    ),
    deploymentEnvironment: yield* Config.NonEmptyString("NODE_ENV").pipe(
      Config.withDefault("development"),
    ),
  } as const;
});
