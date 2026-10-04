import { Config, Redacted, Schema } from "effect";

const PostgresUrl = Schema.String.check(
  Schema.makeFilter(
    (value) => {
      try {
        const protocol = new URL(value).protocol;
        return protocol === "postgres:" || protocol === "postgresql:";
      } catch {
        return false;
      }
    },
    { message: "DATABASE_URL must be a postgres or postgresql URL" },
  ),
);

export const DatabaseUrl = Config.schema(
  Schema.Redacted(PostgresUrl),
  "DATABASE_URL",
).pipe(
  Config.withDefault(Redacted.make("postgres://localhost:5432/coffee_journal")),
);
