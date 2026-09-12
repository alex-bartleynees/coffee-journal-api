import { Effect, Layer } from "effect";
import postgres from "postgres";
import { describe, expect, it } from "vitest";
import { McpAccessGrantRepositoryLive } from "../../src/features/mcp/access-grants/postgres-repository.js";
import { McpAccessGrantRepository } from "../../src/features/mcp/access-grants/repository.js";
import { Postgres } from "../../src/shared/persistence/Postgres.js";
import { integrationContext } from "./infrastructure/global-setup.js";

describe("MCP access grants", () => {
  it("denies access when the user has no grant", async () => {
    const sql = postgres(integrationContext().databaseUrl);
    const userId = crypto.randomUUID();

    try {
      const hasAccess = Effect.gen(function* () {
        const accessGrants = yield* McpAccessGrantRepository;
        return yield* accessGrants.hasAccess(userId);
      }).pipe(
        Effect.provide(McpAccessGrantRepositoryLive),
        Effect.provide(Layer.succeed(Postgres, { sql })),
      );

      expect(await Effect.runPromise(hasAccess)).toBe(false);
    } finally {
      await sql.end();
    }
  });

  it("allows access when the user has a grant", async () => {
    const sql = postgres(integrationContext().databaseUrl);
    const userId = crypto.randomUUID();

    try {
      await sql`
        INSERT INTO mcp_access_grants (user_id, enabled)
        VALUES (${userId}, true)`;

      const hasAccess = Effect.gen(function* () {
        const accessGrants = yield* McpAccessGrantRepository;
        return yield* accessGrants.hasAccess(userId);
      }).pipe(
        Effect.provide(McpAccessGrantRepositoryLive),
        Effect.provide(Layer.succeed(Postgres, { sql })),
      );

      expect(await Effect.runPromise(hasAccess)).toBe(true);
    } finally {
      await sql.end();
    }
  });

  it("denies access when the user's grant is disabled", async () => {
    const sql = postgres(integrationContext().databaseUrl);
    const userId = crypto.randomUUID();

    try {
      await sql`
        INSERT INTO mcp_access_grants (user_id, enabled)
        VALUES (${userId}, false)`;

      const hasAccess = Effect.gen(function* () {
        const accessGrants = yield* McpAccessGrantRepository;
        return yield* accessGrants.hasAccess(userId);
      }).pipe(
        Effect.provide(McpAccessGrantRepositoryLive),
        Effect.provide(Layer.succeed(Postgres, { sql })),
      );

      expect(await Effect.runPromise(hasAccess)).toBe(false);
    } finally {
      await sql.end();
    }
  });

  it("does not use another user's grant", async () => {
    const sql = postgres(integrationContext().databaseUrl);
    const grantedUserId = crypto.randomUUID();
    const otherUserId = crypto.randomUUID();

    try {
      await sql`
        INSERT INTO mcp_access_grants (user_id, enabled)
        VALUES (${grantedUserId}, true)`;

      const hasAccess = Effect.gen(function* () {
        const accessGrants = yield* McpAccessGrantRepository;
        return yield* accessGrants.hasAccess(otherUserId);
      }).pipe(
        Effect.provide(McpAccessGrantRepositoryLive),
        Effect.provide(Layer.succeed(Postgres, { sql })),
      );

      expect(await Effect.runPromise(hasAccess)).toBe(false);
    } finally {
      await sql.end();
    }
  });
});
