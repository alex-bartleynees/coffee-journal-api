import { Context, Effect } from "effect";
import type { DbError } from "../../shared/persistence/errors.js";
import type { PhotoMetadata } from "./contract.js";

export type StoredPhoto = PhotoMetadata & { readonly objectKey: string | null };

export interface PhotoRepositoryService {
  readonly list: (userId: string) => Effect.Effect<PhotoMetadata[], DbError>;
  readonly get: (
    userId: string,
    beanId: string,
  ) => Effect.Effect<StoredPhoto | null, DbError>;
  readonly apply: (
    userId: string,
    photo: PhotoMetadata,
    objectKey: string | null,
  ) => Effect.Effect<
    {
      readonly applied: boolean;
      readonly current: StoredPhoto;
      readonly previousObjectKey: string | null;
    },
    DbError
  >;
}

export class PhotoRepository extends Context.Tag("PhotoRepository")<
  PhotoRepository,
  PhotoRepositoryService
>() {}
