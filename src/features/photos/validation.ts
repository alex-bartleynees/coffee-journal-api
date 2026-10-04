import { Effect, Schema } from "effect";
import { PhotoRequestError } from "./errors.js";

const BeanId = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(128),
  Schema.isPattern(/^[A-Za-z0-9_-]+$/),
);

const UpdatedAtHeader = Schema.NumberFromString.check(
  Schema.isInt(),
  Schema.isGreaterThan(0),
);

const PhotoMimeType = Schema.Literals(["image/webp", "image/jpeg", "image/png"]);
export type PhotoMimeType = typeof PhotoMimeType.Type;

const invalid = (code: string) =>
  new PhotoRequestError({ status: 400, code });

export const parseBeanId = (input: unknown) =>
  Schema.decodeUnknownEffect(BeanId)(input).pipe(
    Effect.mapError(() => invalid("invalid_bean_id")),
  );

export const parseUpdatedAt = (input: unknown) =>
  Schema.decodeUnknownEffect(UpdatedAtHeader)(input).pipe(
    Effect.mapError(() => invalid("invalid_photo")),
  );

export const parsePhotoMimeType = (input: unknown) =>
  Schema.decodeUnknownEffect(PhotoMimeType)(input).pipe(
    Effect.mapError(() => invalid("invalid_photo")),
  );
