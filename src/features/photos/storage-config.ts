import { Config, Effect } from "effect";

export const PhotoStorageConfig = Effect.gen(function* () {
  const endpoint = yield* Config.String("S3_ENDPOINT").pipe(
    Config.withDefault(""),
  );
  if (endpoint.trim() === "") {
    return { enabled: false } as const;
  }
  return {
    enabled: true,
    endpoint: yield* Config.URL("S3_ENDPOINT"),
    region: yield* Config.NonEmptyString("S3_REGION"),
    bucket: yield* Config.NonEmptyString("S3_BUCKET"),
    accessKeyId: yield* Config.Redacted("S3_ACCESS_KEY_ID"),
    secretAccessKey: yield* Config.Redacted("S3_SECRET_ACCESS_KEY"),
    forcePathStyle: yield* Config.Boolean("S3_FORCE_PATH_STYLE").pipe(
      Config.withDefault(false),
    ),
  } as const;
});
