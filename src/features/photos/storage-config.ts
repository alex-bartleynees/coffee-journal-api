import { Config, Effect } from "effect";

export const PhotoStorageConfig = Effect.gen(function* () {
  const endpoint = yield* Config.string("S3_ENDPOINT").pipe(
    Config.withDefault(""),
  );
  if (endpoint.trim() === "") {
    return { enabled: false } as const;
  }
  return {
    enabled: true,
    endpoint: yield* Config.url("S3_ENDPOINT"),
    region: yield* Config.nonEmptyString("S3_REGION"),
    bucket: yield* Config.nonEmptyString("S3_BUCKET"),
    accessKeyId: yield* Config.redacted("S3_ACCESS_KEY_ID"),
    secretAccessKey: yield* Config.redacted("S3_SECRET_ACCESS_KEY"),
    forcePathStyle: yield* Config.boolean("S3_FORCE_PATH_STYLE").pipe(
      Config.withDefault(false),
    ),
  } as const;
});
