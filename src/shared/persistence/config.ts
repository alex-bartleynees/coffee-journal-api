import { Config, Redacted } from "effect";

export const DatabaseUrl = Config.redacted("DATABASE_URL").pipe(
  Config.withDefault(
    Redacted.make("postgres://localhost:5432/coffee_journal"),
  ),
  Config.validate({
    message: "DATABASE_URL must be a postgres or postgresql URL",
    validation: (value) => {
      try {
        const protocol = new URL(Redacted.value(value)).protocol;
        return protocol === "postgres:" || protocol === "postgresql:";
      } catch {
        return false;
      }
    },
  }),
);
