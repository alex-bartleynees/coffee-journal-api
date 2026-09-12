import { Config, Effect, Redacted } from "effect";

export const EntitlementConsumerConfig = Effect.gen(function* () {
  const url = yield* Config.redacted("RABBITMQ_URL").pipe(
    Config.withDefault(Redacted.make("")),
  );
  if (Redacted.value(url).trim() === "") {
    return { enabled: false } as const;
  }
  return { enabled: true, url } as const;
});
