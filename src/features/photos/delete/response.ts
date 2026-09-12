import { Schema } from "effect";
import { PhotoMetadata } from "../model.js";

export const DeletePhotoResponse = Schema.Struct({
  applied: Schema.Boolean,
  photo: PhotoMetadata,
});
export type DeletePhotoResponse = typeof DeletePhotoResponse.Type;
