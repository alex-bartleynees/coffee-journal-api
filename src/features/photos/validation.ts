import { Effect, Schema } from "effect";
import { PhotoRequestError } from "./errors.js";

const BeanId = Schema.String.pipe(
  Schema.minLength(1),
  Schema.maxLength(128),
  Schema.pattern(/^[A-Za-z0-9_-]+$/),
);

const UpdatedAtHeader = Schema.NumberFromString.pipe(
  Schema.int(),
  Schema.positive(),
);

const PhotoMimeType = Schema.Literal(
  "image/webp",
  "image/jpeg",
  "image/png",
);

const invalid = (code: string) =>
  new PhotoRequestError({ status: 400, code });

export const parseBeanId = (input: unknown) =>
  Schema.decodeUnknown(BeanId)(input).pipe(
    Effect.mapError(() => invalid("invalid_bean_id")),
  );

export const parseUpdatedAt = (input: unknown) =>
  Schema.decodeUnknown(UpdatedAtHeader)(input).pipe(
    Effect.mapError(() => invalid("invalid_photo")),
  );

export const parsePhotoMimeType = (input: unknown) =>
  Schema.decodeUnknown(PhotoMimeType)(input).pipe(
    Effect.mapError(() => invalid("invalid_photo")),
  );
