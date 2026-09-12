import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Context, Data, Effect, Layer, Redacted } from "effect";
import { PhotoStorageConfig } from "./storage-config.js";

export class PhotoStorageError extends Data.TaggedError("PhotoStorageError")<{
  readonly cause: unknown;
}> {}

interface PhotoStorageService {
  readonly put: (
    key: string,
    body: Uint8Array,
    mimeType: string,
  ) => Effect.Effect<void, PhotoStorageError>;
  readonly get: (key: string) => Effect.Effect<Uint8Array, PhotoStorageError>;
  readonly delete: (key: string) => Effect.Effect<void, PhotoStorageError>;
}

export class PhotoStorage extends Context.Tag("PhotoStorage")<
  PhotoStorage,
  PhotoStorageService
>() {}

export const PhotoStorageLive = Layer.effect(
  PhotoStorage,
  Effect.gen(function* () {
    const settings = yield* PhotoStorageConfig;
    if (!settings.enabled) {
      const unavailable = () =>
        Effect.fail(
          new PhotoStorageError({
            cause: new Error("S3 photo storage is not configured"),
          }),
        );
      return {
        put: unavailable,
        get: unavailable,
        delete: unavailable,
      } satisfies PhotoStorageService;
    }

    const client = new S3Client({
      endpoint: settings.endpoint.toString(),
      region: settings.region,
      forcePathStyle: settings.forcePathStyle,
      credentials: {
        accessKeyId: Redacted.value(settings.accessKeyId),
        secretAccessKey: Redacted.value(settings.secretAccessKey),
      },
    });

    const run = <T>(operation: (client: S3Client) => Promise<T>) =>
      Effect.tryPromise({
        try: () => operation(client),
        catch: (cause) => new PhotoStorageError({ cause }),
      });

    return {
      put: (key, body, mimeType) =>
        run((s3) =>
          s3
            .send(
              new PutObjectCommand({
                Bucket: settings.bucket,
                Key: key,
                Body: body,
                ContentType: mimeType,
              }),
            )
            .then(() => undefined),
        ),
      get: (key) =>
        run(async (s3) => {
          const response = await s3.send(
            new GetObjectCommand({ Bucket: settings.bucket, Key: key }),
          );
          if (!response.Body) throw new Error("S3 object response had no body");
          return response.Body.transformToByteArray();
        }),
      delete: (key) =>
        run((s3) =>
          s3
            .send(
              new DeleteObjectCommand({ Bucket: settings.bucket, Key: key }),
            )
            .then(() => undefined),
        ),
    };
  }),
);
