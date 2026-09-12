import { Schema } from "effect";
import { PhotoMetadata } from "../model.js";

export const PhotoManifestResponse = Schema.Struct({
  photos: Schema.Array(PhotoMetadata),
});
export type PhotoManifestResponse = typeof PhotoManifestResponse.Type;
