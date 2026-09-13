import { Effect, Layer, Schema } from "effect";
import { DbError } from "../../shared/persistence/errors.js";
import { Postgres } from "../../shared/persistence/Postgres.js";
import {
  StoredBeanSummary,
  StoredBean,
  StoredBrew,
  StoredBrewDetail,
  StoredGrinderSummary,
  StoredMachineSummary,
  StoredMethodSummary,
  StoredRecipeSummary,
  type BrewCursor,
  type BrewDetail,
  type BrewSummary,
  type BeanCursor,
  type BeanInventory,
  type JournalSummary,
  type NoteSearchCursor,
  type NoteSearchResult,
} from "./model.js";
import {
  JournalReadRepository,
  type JournalReadRepositoryService,
} from "./repository.js";

type BrewRow = {
  id: string;
  payload: unknown;
  brew_date: string;
  brew_time: string;
};

type BrewDetailRow = {
  id: string;
  brew_payload: unknown;
  bean_id: string;
  bean_payload: unknown | null;
  method_id: string;
  method_payload: unknown | null;
  grinder_id: string;
  grinder_payload: unknown | null;
  machine_id: string | null;
  machine_payload: unknown | null;
  recipe_id: string | null;
  recipe_payload: unknown | null;
};

type BeanRow = {
  id: string;
  payload: unknown;
  bean_name: string;
  brew_count: number;
  tracked_brew_count: number;
  consumed_weight: number;
};

type SummaryRow = Omit<JournalSummary, "topMethods" | "topBeans"> & {
  topMethods: JournalSummary["topMethods"] | null;
  topBeans: JournalSummary["topBeans"] | null;
};

type NoteSearchRow = {
  entity: NoteSearchResult["entity"];
  id: string;
  title: string;
  note_text: string;
  updated_at: string;
};

const noteRowCursor = (row: NoteSearchRow): NoteSearchCursor => ({
  updatedAt: Number(row.updated_at),
  entity: row.entity,
  id: row.id,
});

const toNoteSearchResult = (row: NoteSearchRow): NoteSearchResult => ({
  entity: row.entity,
  id: row.id,
  title: row.title,
  text: row.note_text,
  updatedAt: Number(row.updated_at),
});

const escapeLikePattern = (query: string): string =>
  query.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");

const decodeBrew = Schema.decodeUnknownEither(StoredBrew);
const decodeBrewDetail = Schema.decodeUnknownEither(StoredBrewDetail);
const decodeBean = Schema.decodeUnknownEither(StoredBeanSummary);
const decodeMethod = Schema.decodeUnknownEither(StoredMethodSummary);
const decodeGrinder = Schema.decodeUnknownEither(StoredGrinderSummary);
const decodeMachine = Schema.decodeUnknownEither(StoredMachineSummary);
const decodeRecipe = Schema.decodeUnknownEither(StoredRecipeSummary);
const decodeStoredBean = Schema.decodeUnknownEither(StoredBean);

const presentTastingFields = (brew: StoredBrew) => ({
  ...(brew.recipeNotes == null ? {} : { recipeNotes: brew.recipeNotes }),
  ...(brew.aroma == null ? {} : { aroma: brew.aroma }),
  ...(brew.flavor == null ? {} : { flavor: brew.flavor }),
  ...(brew.body == null ? {} : { body: brew.body }),
  ...(brew.finish == null ? {} : { finish: brew.finish }),
  ...(brew.descriptors == null ? {} : { descriptors: brew.descriptors }),
  ...(brew.favorite == null ? {} : { favorite: brew.favorite }),
});

const toBean = (row: BeanRow): BeanInventory | null => {
  const decoded = decodeStoredBean(row.payload);
  if (decoded._tag === "Left" || decoded.right.id !== row.id) return null;

  return {
    ...decoded.right,
    brews: row.brew_count,
    consumedWeight: row.consumed_weight,
    remainingWeight:
      row.tracked_brew_count === row.brew_count
        ? Math.max(0, decoded.right.bagWeight - row.consumed_weight)
        : null,
  };
};

const beanRowCursor = (row: BeanRow): BeanCursor => ({
  name: row.bean_name,
  id: row.id,
});

const decodedOrNull = <A extends { readonly id: string }>(
  decoded: { readonly _tag: "Left" } | { readonly _tag: "Right"; readonly right: A },
  expectedId: string | null,
): A | null =>
  decoded._tag === "Right" && decoded.right.id === expectedId
    ? decoded.right
    : null;

const toBrewDetail = (row: BrewDetailRow): BrewDetail | null => {
  const brew = decodedOrNull(decodeBrewDetail(row.brew_payload), row.id);
  if (brew == null) return null;
  const {
    method: methodId,
    grinder: grinderId,
    machine: machineId,
    recipeNotes: _recipeNotes,
    aroma: _aroma,
    flavor: _flavor,
    body: _body,
    finish: _finish,
    descriptors: _descriptors,
    favorite: _favorite,
    ...details
  } = brew;

  return {
    ...details,
    rating: details.rating ?? null,
    ...presentTastingFields(brew),
    methodId,
    grinderId,
    ...(machineId === undefined ? {} : { machineId }),
    bean: decodedOrNull(decodeBean(row.bean_payload), row.bean_id),
    method: decodedOrNull(decodeMethod(row.method_payload), row.method_id),
    grinder: decodedOrNull(decodeGrinder(row.grinder_payload), row.grinder_id),
    machine: decodedOrNull(decodeMachine(row.machine_payload), row.machine_id),
    recipe: decodedOrNull(decodeRecipe(row.recipe_payload), row.recipe_id),
  };
};

const toBrewSummary = (row: BrewRow): BrewSummary | null => {
  const decoded = decodeBrew(row.payload);
  if (decoded._tag === "Left" || decoded.right.id !== row.id) {
    return null;
  }

  const {
    recipeNotes: _recipeNotes,
    aroma: _aroma,
    flavor: _flavor,
    body: _body,
    finish: _finish,
    descriptors: _descriptors,
    favorite: _favorite,
    ...brew
  } = decoded.right;
  return {
    ...brew,
    rating: brew.rating ?? null,
    ...presentTastingFields(decoded.right),
  };
};

const rowCursor = (row: BrewRow): BrewCursor => ({
  date: row.brew_date,
  time: row.brew_time,
  id: row.id,
});

export const JournalReadRepositoryLive = Layer.effect(
  JournalReadRepository,
  Effect.gen(function* () {
    const { sql } = yield* Postgres;

    const listBrews: JournalReadRepositoryService["listBrews"] =
      (userId, query) =>
        Effect.tryPromise({
          try: async () => {
            const cursor = query.cursor;
            const rows = await sql<BrewRow[]>`
              SELECT id, payload,
                payload->>'date' AS brew_date,
                payload->>'time' AS brew_time
              FROM sync_records
              WHERE user_id = ${userId}
                AND entity = 'brew'
                AND deleted = false
                AND payload IS NOT NULL
                AND jsonb_typeof(payload->'date') = 'string'
                AND jsonb_typeof(payload->'time') = 'string'
                ${
                  query.from == null
                    ? sql``
                    : sql`AND payload->>'date' >= ${query.from}`
                }
                ${
                  query.to == null
                    ? sql``
                    : sql`AND payload->>'date' <= ${query.to}`
                }
                ${
                  query.method == null
                    ? sql``
                    : sql`AND payload->>'method' = ${query.method}`
                }
                ${
                  query.minimumRating == null
                    ? sql``
                    : sql`AND CASE
                        WHEN jsonb_typeof(payload->'rating') = 'number'
                        THEN (payload->>'rating')::numeric
                      END >= ${query.minimumRating}`
                }
                ${
                  query.beanId == null
                    ? sql``
                    : sql`AND payload->>'beanId' = ${query.beanId}`
                }
                ${
                  cursor == null
                    ? sql``
                    : sql`AND (
                        payload->>'date' < ${cursor.date}
                        OR (payload->>'date' = ${cursor.date} AND payload->>'time' < ${cursor.time})
                        OR (payload->>'date' = ${cursor.date} AND payload->>'time' = ${cursor.time} AND id > ${cursor.id})
                      )`
                }
              ORDER BY payload->>'date' DESC, payload->>'time' DESC, id ASC
              LIMIT ${query.limit + 1}`;

            const pageRows = rows.slice(0, query.limit);

            return {
              brews: pageRows.flatMap((row) => {
                const brew = toBrewSummary(row);
                return brew == null ? [] : [brew];
              }),
              nextCursor:
                rows.length > query.limit
                  ? rowCursor(pageRows[pageRows.length - 1]!)
                  : null,
            };
          },
          catch: (cause) => new DbError({ cause }),
        });

    const getBrew: JournalReadRepositoryService["getBrew"] = (userId, brewId) =>
      Effect.tryPromise({
        try: async () => {
          const rows = await sql<BrewDetailRow[]>`
            SELECT
              brew.id,
              brew.payload AS brew_payload,
              brew.payload->>'beanId' AS bean_id,
              bean.payload AS bean_payload,
              brew.payload->>'method' AS method_id,
              method.payload AS method_payload,
              brew.payload->>'grinder' AS grinder_id,
              grinder.payload AS grinder_payload,
              brew.payload->>'machine' AS machine_id,
              machine.payload AS machine_payload,
              brew.payload->>'recipeId' AS recipe_id,
              recipe.payload AS recipe_payload
            FROM sync_records AS brew
            LEFT JOIN sync_records AS bean
              ON bean.user_id = brew.user_id
              AND bean.entity = 'bean'
              AND bean.id = brew.payload->>'beanId'
              AND bean.deleted = false
            LEFT JOIN sync_records AS method
              ON method.user_id = brew.user_id
              AND method.entity = 'method'
              AND method.id = brew.payload->>'method'
              AND method.deleted = false
            LEFT JOIN sync_records AS grinder
              ON grinder.user_id = brew.user_id
              AND grinder.entity = 'grinder'
              AND grinder.id = brew.payload->>'grinder'
              AND grinder.deleted = false
            LEFT JOIN sync_records AS machine
              ON machine.user_id = brew.user_id
              AND machine.entity = 'machine'
              AND machine.id = brew.payload->>'machine'
              AND machine.deleted = false
            LEFT JOIN sync_records AS recipe
              ON recipe.user_id = brew.user_id
              AND recipe.entity = 'recipe'
              AND recipe.id = brew.payload->>'recipeId'
              AND recipe.deleted = false
            WHERE brew.user_id = ${userId}
              AND brew.entity = 'brew'
              AND brew.id = ${brewId}
              AND brew.deleted = false
              AND brew.payload IS NOT NULL
            LIMIT 1`;

          return rows[0] == null ? null : toBrewDetail(rows[0]);
        },
        catch: (cause) => new DbError({ cause }),
      });

    const listBeans: JournalReadRepositoryService["listBeans"] =
      (userId, query) =>
        Effect.tryPromise({
          try: async () => {
            const cursor = query.cursor;
            const rows = await sql<BeanRow[]>`
              SELECT
                bean.id,
                bean.payload,
                lower(bean.payload->>'name') AS bean_name,
                count(brew.id)::int AS brew_count,
                count(brew.id) FILTER (
                  WHERE jsonb_typeof(brew.payload->'doseIn') = 'number'
                    AND (brew.payload->>'doseIn')::double precision >= 0
                )::int AS tracked_brew_count,
                COALESCE(sum(
                  CASE
                    WHEN jsonb_typeof(brew.payload->'doseIn') = 'number'
                      AND (brew.payload->>'doseIn')::double precision >= 0
                    THEN (brew.payload->>'doseIn')::double precision
                    ELSE 0
                  END
                ), 0)::double precision AS consumed_weight
              FROM sync_records AS bean
              LEFT JOIN sync_records AS brew
                ON brew.user_id = bean.user_id
                AND brew.entity = 'brew'
                AND brew.deleted = false
                AND brew.payload IS NOT NULL
                AND brew.payload->>'beanId' = bean.id
              WHERE bean.user_id = ${userId}
                AND bean.entity = 'bean'
                AND bean.deleted = false
                AND bean.payload IS NOT NULL
                AND jsonb_typeof(bean.payload->'name') = 'string'
                ${
                  query.status === "all"
                    ? sql``
                    : query.status === "finished"
                      ? sql`AND CASE
                          WHEN jsonb_typeof(bean.payload->'finished') = 'boolean'
                          THEN (bean.payload->>'finished')::boolean
                          ELSE false
                        END = true`
                      : sql`AND CASE
                          WHEN jsonb_typeof(bean.payload->'finished') = 'boolean'
                          THEN (bean.payload->>'finished')::boolean
                          ELSE false
                        END = false`
                }
                ${
                  query.roaster == null
                    ? sql``
                    : sql`AND lower(bean.payload->>'roaster') = lower(${query.roaster})`
                }
                ${
                  cursor == null
                    ? sql``
                    : sql`AND (
                        lower(bean.payload->>'name') > ${cursor.name}
                        OR (lower(bean.payload->>'name') = ${cursor.name} AND bean.id > ${cursor.id})
                      )`
                }
              GROUP BY bean.id, bean.payload
              ORDER BY lower(bean.payload->>'name') ASC, bean.id ASC
              LIMIT ${query.limit + 1}`;

            const pageRows = rows.slice(0, query.limit);
            return {
              beans: pageRows.flatMap((row) => {
                const bean = toBean(row);
                return bean == null ? [] : [bean];
              }),
              nextCursor:
                rows.length > query.limit
                  ? beanRowCursor(pageRows[pageRows.length - 1]!)
                  : null,
            };
          },
          catch: (cause) => new DbError({ cause }),
        });

    const getSummary: JournalReadRepositoryService["getSummary"] =
      (userId, query) =>
        Effect.tryPromise({
          try: async () => {
            const rows = await sql<SummaryRow[]>`
              WITH brews AS (
                SELECT user_id, payload
                FROM sync_records
                WHERE user_id = ${userId}
                  AND entity = 'brew'
                  AND deleted = false
                  AND payload IS NOT NULL
                  AND jsonb_typeof(payload->'date') = 'string'
                  ${
                    query.from == null
                      ? sql``
                      : sql`AND payload->>'date' >= ${query.from}`
                  }
                  ${
                    query.to == null
                      ? sql``
                      : sql`AND payload->>'date' <= ${query.to}`
                  }
              ),
              method_counts AS (
                SELECT
                  brews.payload->>'method' AS "methodId",
                  COALESCE(method.payload->>'label', brews.payload->>'method') AS label,
                  count(*)::int AS "brewCount"
                FROM brews
                LEFT JOIN sync_records AS method
                  ON method.user_id = brews.user_id
                  AND method.entity = 'method'
                  AND method.id = brews.payload->>'method'
                  AND method.deleted = false
                WHERE jsonb_typeof(brews.payload->'method') = 'string'
                GROUP BY brews.payload->>'method', method.payload->>'label'
                ORDER BY "brewCount" DESC, "methodId" ASC
                LIMIT 5
              ),
              bean_counts AS (
                SELECT
                  brews.payload->>'beanId' AS "beanId",
                  COALESCE(bean.payload->>'name', brews.payload->>'beanId') AS name,
                  bean.payload->>'roaster' AS roaster,
                  count(*)::int AS "brewCount"
                FROM brews
                LEFT JOIN sync_records AS bean
                  ON bean.user_id = brews.user_id
                  AND bean.entity = 'bean'
                  AND bean.id = brews.payload->>'beanId'
                  AND bean.deleted = false
                WHERE jsonb_typeof(brews.payload->'beanId') = 'string'
                GROUP BY brews.payload->>'beanId', bean.payload->>'name', bean.payload->>'roaster'
                ORDER BY "brewCount" DESC, "beanId" ASC
                LIMIT 5
              )
              SELECT
                count(*)::int AS "totalBrews",
                count(*) FILTER (
                  WHERE jsonb_typeof(payload->'rating') = 'number'
                )::int AS "ratedBrews",
                avg(
                  CASE WHEN jsonb_typeof(payload->'rating') = 'number'
                    THEN (payload->>'rating')::double precision
                  END
                ) AS "averageRating",
                count(*) FILTER (
                  WHERE jsonb_typeof(payload->'favorite') = 'boolean'
                    AND (payload->>'favorite')::boolean = true
                )::int AS "favoriteBrews",
                COALESCE(
                  (SELECT jsonb_agg(method_counts) FROM method_counts),
                  '[]'::jsonb
                ) AS "topMethods",
                COALESCE(
                  (SELECT jsonb_agg(bean_counts) FROM bean_counts),
                  '[]'::jsonb
                ) AS "topBeans"
              FROM brews`;
            const row = rows[0]!;
            return {
              ...row,
              topMethods: row.topMethods ?? [],
              topBeans: row.topBeans ?? [],
            };
          },
          catch: (cause) => new DbError({ cause }),
        });

    const searchNotes: JournalReadRepositoryService["searchNotes"] =
      (userId, query) =>
        Effect.tryPromise({
          try: async () => {
            const cursor = query.cursor;
            const pattern = `%${escapeLikePattern(query.query)}%`;
            const rows = await sql<NoteSearchRow[]>`
              WITH searchable AS (
                SELECT
                  entity,
                  id,
                  updated_at,
                  CASE entity
                    WHEN 'brew' THEN concat('Brew on ', payload->>'date')
                    WHEN 'method' THEN COALESCE(payload->>'label', id)
                    ELSE COALESCE(payload->>'name', id)
                  END AS title,
                  CASE entity
                    WHEN 'brew' THEN concat_ws(' ',
                      payload->>'recipeNotes', payload->>'aroma',
                      payload->>'flavor', payload->>'body', payload->>'finish',
                      payload->>'descriptors')
                    WHEN 'bean' THEN concat_ws(' ',
                      payload->>'name', payload->>'roaster', payload->>'origin',
                      payload->>'process', payload->>'varietal', payload->>'tasting')
                    ELSE COALESCE(payload->>'notes', '')
                  END AS note_text
                FROM sync_records
                WHERE user_id = ${userId}
                  AND deleted = false
                  AND payload IS NOT NULL
                  AND entity IN ${sql(query.entities)}
              )
              SELECT entity, id, title, left(note_text, 1000) AS note_text, updated_at
              FROM searchable
              WHERE note_text ILIKE ${pattern} ESCAPE '\\'
                ${
                  cursor == null
                    ? sql``
                    : sql`AND (
                        updated_at < ${cursor.updatedAt}
                        OR (updated_at = ${cursor.updatedAt} AND entity > ${cursor.entity})
                        OR (updated_at = ${cursor.updatedAt} AND entity = ${cursor.entity} AND id > ${cursor.id})
                      )`
                }
              ORDER BY updated_at DESC, entity ASC, id ASC
              LIMIT ${query.limit + 1}`;
            const pageRows = rows.slice(0, query.limit);
            return {
              results: pageRows.map(toNoteSearchResult),
              nextCursor:
                rows.length > query.limit
                  ? noteRowCursor(pageRows[pageRows.length - 1]!)
                  : null,
            };
          },
          catch: (cause) => new DbError({ cause }),
        });

    return { listBrews, getBrew, listBeans, getSummary, searchNotes };
  }),
);
