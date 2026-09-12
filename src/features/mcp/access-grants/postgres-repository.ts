import { Effect, Layer } from "effect";
import {
  McpAccessGrantRepository,
  McpAccessGrantRepositoryService,
} from "./repository.js";
import { Postgres } from "../../../shared/persistence/Postgres.js";
import { DbError } from "../../../shared/persistence/errors.js";

export const McpAccessGrantRepositoryLive = Layer.effect(
  McpAccessGrantRepository,
  Effect.gen(function* () {
    const { sql } = yield* Postgres;

    const hasAccess: McpAccessGrantRepositoryService["hasAccess"] = (
      userId,
    ) => {
      return Effect.tryPromise({
        try: async () => {
          const rows = await sql<{ enabled: boolean }[]>`
                        SELECT enabled FROM mcp_access_grants WHERE user_id = ${userId}`;
          return rows[0]?.enabled === true;
        },
        catch: (cause) => new DbError({ cause }),
      });
    };

    return { hasAccess };
  }),
);
