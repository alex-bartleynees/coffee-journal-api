import { Effect, Layer } from "effect";
import { DbError } from "../../shared/persistence/errors.js";
import { Postgres } from "../../shared/persistence/Postgres.js";
import { UserRepository, type UserRepositoryService } from "./repository.js";

export const UserRepositoryLive = Layer.effect(
  UserRepository,
  Effect.gen(function* () {
    const { sql } = yield* Postgres;

    const register: UserRepositoryService["register"] = (userId, email) =>
      Effect.tryPromise({
        try: async () => {
          await sql`
						INSERT INTO users (user_id, email, last_sync_at)
						VALUES (${userId}, ${email}, NULL)
						ON CONFLICT (user_id) DO UPDATE
							SET email = COALESCE(excluded.email, users.email)`;
        },
        catch: (cause) => new DbError({ cause }),
      });

    const touchAfterSync: UserRepositoryService["touchAfterSync"] = (
      userId,
      email,
    ) =>
      Effect.tryPromise({
        try: async () => {
          await sql`
						INSERT INTO users (user_id, email, last_sync_at)
						VALUES (${userId}, ${email}, now())
						ON CONFLICT (user_id) DO UPDATE
							SET last_sync_at = now(),
								email = COALESCE(excluded.email, users.email)`;
        },
        catch: (cause) => new DbError({ cause }),
      });

    return { register, touchAfterSync };
  }),
);
