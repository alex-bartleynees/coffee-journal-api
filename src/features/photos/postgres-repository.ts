import { Effect, Layer } from "effect";
import { DbError } from "../../shared/persistence/errors.js";
import { Postgres } from "../../shared/persistence/Postgres.js";
import type { PhotoMetadata } from "./contract.js";
import {
  PhotoRepository,
  type PhotoRepositoryService,
  type StoredPhoto,
} from "./repository.js";

type PhotoRow = {
  bean_id: string;
  updated_at: string;
  deleted: boolean;
  mime_type: string | null;
  object_key: string | null;
};

const toStoredPhoto = (row: PhotoRow): StoredPhoto => ({
  beanId: row.bean_id,
  updatedAt: Number(row.updated_at),
  deleted: row.deleted,
  mimeType: row.mime_type,
  objectKey: row.object_key,
});

export const PhotoRepositoryLive = Layer.effect(
  PhotoRepository,
  Effect.gen(function* () {
    const { sql } = yield* Postgres;

    const list: PhotoRepositoryService["list"] = (userId) =>
      Effect.tryPromise({
        try: async () => {
          const rows = await sql<PhotoRow[]>`
						SELECT bean_id, updated_at, deleted, mime_type, object_key
						FROM bean_photos WHERE user_id = ${userId}`;
          return rows.map(({ object_key: _, ...row }) => ({
            beanId: row.bean_id,
            updatedAt: Number(row.updated_at),
            deleted: row.deleted,
            mimeType: row.mime_type,
          }));
        },
        catch: (cause) => new DbError({ cause }),
      });

    const get: PhotoRepositoryService["get"] = (userId, beanId) =>
      Effect.tryPromise({
        try: async () => {
          const rows = await sql<PhotoRow[]>`
						SELECT bean_id, updated_at, deleted, mime_type, object_key FROM bean_photos
						WHERE user_id = ${userId} AND bean_id = ${beanId}`;
          return rows[0] ? toStoredPhoto(rows[0]) : null;
        },
        catch: (cause) => new DbError({ cause }),
      });

    const apply: PhotoRepositoryService["apply"] = (userId, photo, objectKey) =>
      Effect.tryPromise({
        try: () =>
          sql.begin(async (tx) => {
            const before = await tx<{ object_key: string | null }[]>`
						SELECT object_key FROM bean_photos
						WHERE user_id = ${userId} AND bean_id = ${photo.beanId}`;
            const rows = await tx<PhotoRow[]>`
						INSERT INTO bean_photos AS bp
							(user_id, bean_id, updated_at, deleted, mime_type, object_key)
						VALUES (${userId}, ${photo.beanId}, ${photo.updatedAt}, ${photo.deleted}, ${photo.mimeType}, ${objectKey})
						ON CONFLICT (user_id, bean_id) DO UPDATE SET
							updated_at = excluded.updated_at, deleted = excluded.deleted,
							mime_type = excluded.mime_type, object_key = excluded.object_key
						WHERE excluded.updated_at > bp.updated_at
						RETURNING bean_id, updated_at, deleted, mime_type, object_key`;
            const applied = rows.length > 0;
            const currentRows = applied
              ? rows
              : await tx<PhotoRow[]>`
						SELECT bean_id, updated_at, deleted, mime_type, object_key FROM bean_photos
						WHERE user_id = ${userId} AND bean_id = ${photo.beanId}`;
            return {
              applied,
              current: toStoredPhoto(currentRows[0]!),
              previousObjectKey: applied
                ? (before[0]?.object_key ?? null)
                : null,
            };
          }) as Promise<{
            applied: boolean;
            current: PhotoMetadata & { objectKey: string | null };
            previousObjectKey: string | null;
          }>,
        catch: (cause) => new DbError({ cause }),
      });

    return { list, get, apply };
  }),
);
