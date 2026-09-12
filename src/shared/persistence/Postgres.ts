import { Context, Effect, Layer, Redacted } from "effect";
import postgres from "postgres";
import { DatabaseUrl } from "./config.js";
import { migrate } from "./migrations.js";

export interface PostgresService {
  readonly sql: postgres.Sql;
}

export class Postgres extends Context.Tag("Postgres")<
  Postgres,
  PostgresService
>() {}

export const PostgresLive = Layer.scoped(
  Postgres,
  Effect.gen(function* () {
    const url = Redacted.value(yield* DatabaseUrl);
    const sql = yield* Effect.acquireRelease(
      Effect.sync(() => postgres(url)),
      (client) => Effect.promise(() => client.end()),
    );
    yield* migrate(sql);
    return { sql };
  }),
);
