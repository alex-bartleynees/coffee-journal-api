import { Effect, Layer } from "effect";
import { DbError } from "../../shared/persistence/errors.js";
import { Postgres } from "../../shared/persistence/Postgres.js";
import {
  EntitlementRepository,
  type EntitlementRepositoryService,
} from "./repository.js";

export const EntitlementRepositoryLive = Layer.effect(
  EntitlementRepository,
  Effect.gen(function* () {
    const { sql } = yield* Postgres;

    const hasAccess: EntitlementRepositoryService["hasAccess"] = (userId) =>
      Effect.tryPromise({
        try: async () => {
          const rows = await sql<{ has_access: boolean }[]>`
						SELECT has_access FROM entitlements WHERE user_id = ${userId}`;
          return rows[0]?.has_access === true;
        },
        catch: (cause) => new DbError({ cause }),
      });

    const apply: EntitlementRepositoryService["apply"] = (event) =>
      Effect.tryPromise({
        try: () =>
          sql.begin(async (tx) => {
            const inserted = await tx`
							INSERT INTO processed_messages (message_id)
							VALUES (${event.MessageId})
							ON CONFLICT (message_id) DO NOTHING
							RETURNING message_id`;
            if (inserted.length === 0) return false;

            await tx`
							INSERT INTO entitlements
								(user_id, product_id, has_access, status, current_period_end, cancel_at_period_end, updated_at)
							VALUES (
								${event.UserId}, ${event.ProductId}, ${event.HasAccess}, ${event.Status},
								${event.CurrentPeriodEnd ?? null}, ${event.CancelAtPeriodEnd}, now()
							)
							ON CONFLICT (user_id) DO UPDATE
								SET product_id = excluded.product_id,
									has_access = excluded.has_access,
									status = excluded.status,
									current_period_end = excluded.current_period_end,
									cancel_at_period_end = excluded.cancel_at_period_end,
									updated_at = now()`;
            return true;
          }) as Promise<boolean>,
        catch: (cause) => new DbError({ cause }),
      });

    return { hasAccess, apply };
  }),
);
