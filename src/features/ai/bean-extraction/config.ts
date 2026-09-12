import { Config, Effect, Redacted } from "effect";

export const BeanExtractionConfig = Effect.gen(function* () {
  const apiKey = yield* Config.redacted("OPENROUTER_API_KEY").pipe(
    Config.withDefault(Redacted.make("")),
  );
  if (Redacted.value(apiKey).trim() === "") {
    return { enabled: false } as const;
  }

  return {
    enabled: true,
    apiKey,
    model: yield* Config.nonEmptyString("AI_BEAN_EXTRACTION_MODEL").pipe(
      Config.withDefault("google/gemini-2.5-flash-lite"),
    ),
  } as const;
});
