import { Effect } from "effect";
import type { PhotoMetadata, PhotoMutationResponse } from "./contract.js";
import { PhotoRequestError } from "./errors.js";
import { PhotoRepository } from "./repository.js";
import { PhotoStorage } from "./storage.js";

const publicPhoto = (photo: PhotoMetadata): PhotoMetadata => ({
  beanId: photo.beanId,
  updatedAt: photo.updatedAt,
  deleted: photo.deleted,
  mimeType: photo.mimeType,
});

const bestEffortDelete = (storage: PhotoStorage["Type"], key: string) =>
  storage
    .delete(key)
    .pipe(
      Effect.catchAll((cause) =>
        Effect.logWarning("Failed to remove superseded photo object", {
          key,
          cause,
        }),
      ),
    );

export const listPhotos = (userId: string) =>
  Effect.gen(function* () {
    const photos = yield* PhotoRepository;
    return yield* photos.list(userId);
  });

export const putPhoto = (
  userId: string,
  photo: PhotoMetadata & { readonly deleted: false; readonly mimeType: string },
  bytes: Uint8Array,
) =>
  Effect.gen(function* () {
    const photos = yield* PhotoRepository;
    const storage = yield* PhotoStorage;
    const key = `users/${encodeURIComponent(userId)}/beans/${photo.beanId}/${photo.updatedAt}`;
    yield* storage.put(key, bytes, photo.mimeType);
    const result = yield* photos.apply(userId, photo, key);
    if (!result.applied) yield* bestEffortDelete(storage, key);
    else if (result.previousObjectKey && result.previousObjectKey !== key) {
      yield* bestEffortDelete(storage, result.previousObjectKey);
    }
    return {
      applied: result.applied,
      photo: publicPhoto(result.current),
    } satisfies PhotoMutationResponse;
  });

export const deletePhoto = (userId: string, photo: PhotoMetadata) =>
  Effect.gen(function* () {
    const photos = yield* PhotoRepository;
    const storage = yield* PhotoStorage;
    const result = yield* photos.apply(userId, photo, null);
    if (result.applied && result.previousObjectKey) {
      yield* bestEffortDelete(storage, result.previousObjectKey);
    }
    return {
      applied: result.applied,
      photo: publicPhoto(result.current),
    } satisfies PhotoMutationResponse;
  });

export const getPhoto = (userId: string, beanId: string) =>
  Effect.gen(function* () {
    const photos = yield* PhotoRepository;
    const storage = yield* PhotoStorage;
    const photo = yield* photos.get(userId, beanId);
    if (!photo || photo.deleted || !photo.objectKey || !photo.mimeType) {
      return yield* new PhotoRequestError({
        status: 404,
        code: "photo_not_found",
      });
    }
    return {
      bytes: yield* storage.get(photo.objectKey),
      mimeType: photo.mimeType,
    };
  });
