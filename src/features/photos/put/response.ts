import { Schema } from "effect";
import { PhotoMetadata } from "../model.js";

export const PutPhotoResponse = Schema.Struct({
  applied: Schema.Boolean,
  photo: PhotoMetadata,
});
export type PutPhotoResponse = typeof PutPhotoResponse.Type;
