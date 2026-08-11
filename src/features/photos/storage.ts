import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Context, Data, Effect, Layer } from 'effect';
import { AppConfig } from '../../config.js';

export class PhotoStorageError extends Data.TaggedError('PhotoStorageError')<{
	readonly cause: unknown;
}> {}

interface PhotoStorageService {
	readonly put: (key: string, body: Uint8Array, mimeType: string) => Effect.Effect<void, PhotoStorageError>;
	readonly get: (key: string) => Effect.Effect<Uint8Array, PhotoStorageError>;
	readonly delete: (key: string) => Effect.Effect<void, PhotoStorageError>;
}

export class PhotoStorage extends Context.Tag('PhotoStorage')<PhotoStorage, PhotoStorageService>() {}

export const PhotoStorageLive = Layer.effect(
	PhotoStorage,
	Effect.gen(function* () {
		const endpoint = yield* AppConfig.s3Endpoint;
		const region = yield* AppConfig.s3Region;
		const bucket = yield* AppConfig.s3Bucket;
		const accessKeyId = yield* AppConfig.s3AccessKeyId;
		const secretAccessKey = yield* AppConfig.s3SecretAccessKey;
		const forcePathStyle = yield* AppConfig.s3ForcePathStyle;
		const configured = endpoint && region && bucket && accessKeyId && secretAccessKey;
		const client = configured
			? new S3Client({ endpoint, region, forcePathStyle, credentials: { accessKeyId, secretAccessKey } })
			: null;

		const run = <T>(operation: (client: S3Client) => Promise<T>) =>
			client
				? Effect.tryPromise({ try: () => operation(client), catch: (cause) => new PhotoStorageError({ cause }) })
				: Effect.fail(new PhotoStorageError({ cause: new Error('S3 photo storage is not configured') }));

		return {
			put: (key, body, mimeType) => run((s3) => s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: mimeType })).then(() => undefined)),
			get: (key) => run(async (s3) => {
				const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
				if (!response.Body) throw new Error('S3 object response had no body');
				return response.Body.transformToByteArray();
			}),
			delete: (key) => run((s3) => s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).then(() => undefined))
		};
	})
);
