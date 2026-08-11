import { Schema } from 'effect';

export const PhotoMetadata = Schema.Struct({
	beanId: Schema.String,
	updatedAt: Schema.Number,
	deleted: Schema.Boolean,
	mimeType: Schema.NullOr(Schema.String)
});
export type PhotoMetadata = typeof PhotoMetadata.Type;

export const PhotoManifest = Schema.Struct({ photos: Schema.Array(PhotoMetadata) });
export type PhotoManifest = typeof PhotoManifest.Type;

export const PhotoMutationResponse = Schema.Struct({
	applied: Schema.Boolean,
	photo: PhotoMetadata
});
export type PhotoMutationResponse = typeof PhotoMutationResponse.Type;
