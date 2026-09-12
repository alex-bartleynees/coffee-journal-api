import { Schema } from "effect";

export const PhotoMetadata = Schema.Struct({
  beanId: Schema.String,
  updatedAt: Schema.Number,
  deleted: Schema.Boolean,
  mimeType: Schema.NullOr(Schema.String),
});
export type PhotoMetadata = typeof PhotoMetadata.Type;
