import { Effect } from "effect";
import type { DeletePhotoRequest } from "./delete/request.js";
import type { DeletePhotoResponse } from "./delete/response.js";
import { PhotoRequestError } from "./errors.js";
import type { GetPhotoRequest } from "./get/request.js";
import type { GetPhotoResponse } from "./get/response.js";
import type { PhotoManifestRequest } from "./manifest/request.js";
import type { PhotoManifestResponse } from "./manifest/response.js";
import type { PhotoMetadata } from "./model.js";
import type { PutPhotoRequest } from "./put/request.js";
import type { PutPhotoResponse } from "./put/response.js";
import { PhotoRepository } from "./repository.js";
import { PhotoStorage } from "./storage.js";

const publicPhoto = (photo: PhotoMetadata): PhotoMetadata => ({
  beanId: photo.beanId,
  updatedAt: photo.updatedAt,
  deleted: photo.deleted,
  mimeType: photo.mimeType,
});

const bestEffortDelete = (storage: PhotoStorage["Type"], key: string) =>
  storage.delete(key).pipe(
    Effect.catchAll((cause) =>
      Effect.logWarning("Failed to remove superseded photo object", {
        key,
        cause,
      }),
    ),
  );

export const listPhotos = (request: PhotoManifestRequest) =>
  Effect.gen(function* () {
    const photos = yield* PhotoRepository;
    return {
      photos: yield* photos.list(request.userId),
    } satisfies PhotoManifestResponse;
  }).pipe(
    Effect.withSpan("coffee.photo", {
      kind: "internal",
      attributes: { "coffee.photo.operation": "list" },
    }),
  );

export const putPhoto = (request: PutPhotoRequest) =>
  Effect.gen(function* () {
    const photos = yield* PhotoRepository;
    const storage = yield* PhotoStorage;
    const photo = {
      beanId: request.beanId,
      updatedAt: request.updatedAt,
      deleted: false,
      mimeType: request.mimeType,
    } as const;
    const key = `users/${encodeURIComponent(request.userId)}/beans/${request.beanId}/${request.updatedAt}`;
    yield* storage.put(key, request.bytes, request.mimeType);
    const result = yield* photos.apply(request.userId, photo, key);
    if (!result.applied) {
      yield* bestEffortDelete(storage, key);
    } else if (result.previousObjectKey && result.previousObjectKey !== key) {
      yield* bestEffortDelete(storage, result.previousObjectKey);
    }
    return {
      applied: result.applied,
      photo: publicPhoto(result.current),
    } satisfies PutPhotoResponse;
  }).pipe(
    Effect.withSpan("coffee.photo", {
      kind: "internal",
      attributes: {
        "coffee.photo.operation": "put",
        "coffee.photo.content_type": request.mimeType,
        "coffee.photo.size": request.bytes.byteLength,
      },
    }),
  );

export const deletePhoto = (request: DeletePhotoRequest) =>
  Effect.gen(function* () {
    const photos = yield* PhotoRepository;
    const storage = yield* PhotoStorage;
    const result = yield* photos.apply(
      request.userId,
      {
        beanId: request.beanId,
        updatedAt: request.updatedAt,
        deleted: true,
        mimeType: null,
      },
      null,
    );
    if (result.applied && result.previousObjectKey) {
      yield* bestEffortDelete(storage, result.previousObjectKey);
    }
    return {
      applied: result.applied,
      photo: publicPhoto(result.current),
    } satisfies DeletePhotoResponse;
  }).pipe(
    Effect.withSpan("coffee.photo", {
      kind: "internal",
      attributes: { "coffee.photo.operation": "delete" },
    }),
  );

export const getPhoto = (request: GetPhotoRequest) =>
  Effect.gen(function* () {
    const photos = yield* PhotoRepository;
    const storage = yield* PhotoStorage;
    const photo = yield* photos.get(request.userId, request.beanId);
    if (!photo || photo.deleted || !photo.objectKey || !photo.mimeType) {
      return yield* new PhotoRequestError({
        status: 404,
        code: "photo_not_found",
      });
    }
    return {
      bytes: yield* storage.get(photo.objectKey),
      mimeType: photo.mimeType,
    } satisfies GetPhotoResponse;
  }).pipe(
    Effect.withSpan("coffee.photo", {
      kind: "internal",
      attributes: { "coffee.photo.operation": "get" },
    }),
  );
