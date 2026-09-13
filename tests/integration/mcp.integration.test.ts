import postgres from "postgres";
import { describe, expect, it } from "vitest";
import { apiUrl } from "./infrastructure/api.js";
import { integrationContext } from "./infrastructure/global-setup.js";

const parseServerSentEvent = (body: string): unknown => {
  const data = body
    .split(/\r?\n/)
    .find((line) => line.startsWith("data: "))
    ?.slice("data: ".length);

  if (data == null) {
    throw new Error(`Expected an SSE data event, received: ${body}`);
  }

  return JSON.parse(data);
};

const grantMcpAccess = async (userId: string) => {
  const sql = postgres(integrationContext().databaseUrl);
  try {
    await sql`INSERT INTO mcp_access_grants (user_id, enabled)
      VALUES (${userId}, true)`;
  } finally {
    await sql.end();
  }
};

const authenticatedHeaders = (
  userId: string,
  headers: Readonly<Record<string, string>> = {},
): Record<string, string> => ({
  authorization: `Bearer ${integrationContext().accessToken(userId, {
    audience: "coffee-journal-mcp",
    scope: "coffee-journal:read",
    clientId: "coffee-journal-mcp",
  })}`,
  ...headers,
});

const callMcp = async (
  userId: string,
  request: Readonly<Record<string, unknown>>,
) => {
  const response = await fetch(apiUrl("/mcp"), {
    method: "POST",
    headers: authenticatedHeaders(userId, {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-11-25",
    }),
    body: JSON.stringify(request),
  });

  expect(response.status).toBe(200);
  return parseServerSentEvent(await response.text());
};

describe("MCP", () => {
  it("publishes OAuth protected-resource metadata", async () => {
    const response = await fetch(
      apiUrl("/.well-known/oauth-protected-resource/mcp"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({
      resource: apiUrl("/mcp"),
      authorization_servers: [integrationContext().jwtIssuer],
      scopes_supported: ["coffee-journal:read"],
      resource_name: "Coffee Journal MCP",
    });
  });

  it("points unauthenticated clients to protected-resource metadata", async () => {
    const response = await fetch(apiUrl("/mcp"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "unauthenticated",
        method: "tools/list",
        params: {},
      }),
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain(
      `resource_metadata="${apiUrl("/.well-known/oauth-protected-resource/mcp")}"`,
    );
  });

  it("server returns its name, version and capabilities", async () => {
    const userId = crypto.randomUUID();
    await grantMcpAccess(userId);
    const response = await fetch(apiUrl("/mcp"), {
      method: "POST",
      headers: authenticatedHeaders(userId, {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      }),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "test-request-id",
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: {
            name: "coffee-journal-integration-tests",
            version: "1.0.0",
          },
        },
      }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain(
      "text/event-stream",
    );

    const body = parseServerSentEvent(await response.text());

    expect(body).toEqual({
      jsonrpc: "2.0",
      id: "test-request-id",
      result: {
        protocolVersion: "2025-11-25",
        capabilities: {
          tools: { listChanged: true },
        },
        serverInfo: {
          name: "coffee-journal",
          version: "0.1.0",
        },
        instructions:
          "Read-only access to the authenticated user's coffee journal.",
      },
    });
  });

  it("lists only the authenticated user's non-deleted brews", async () => {
    const userId = crypto.randomUUID();
    const otherUserId = crypto.randomUUID();
    const ownBrewId = crypto.randomUUID();
    const quickBrewId = crypto.randomUUID();
    const deletedBrewId = crypto.randomUUID();
    const otherBrewId = crypto.randomUUID();
    await grantMcpAccess(userId);

    const sql = postgres(integrationContext().databaseUrl);
    try {
      const ownBrew = {
        id: ownBrewId,
        beanId: crypto.randomUUID(),
        method: "V60",
        date: "2026-09-13",
        time: "08:30",
        rating: 8.5,
        flavor: "Stone fruit and caramel",
        recipeNotes: "Use a slightly finer grind next time",
      };
      const deletedBrew = { ...ownBrew, id: deletedBrewId };
      const otherBrew = { ...ownBrew, id: otherBrewId };
      const quickBrew = {
        id: quickBrewId,
        beanId: crypto.randomUUID(),
        method: "espresso",
        date: "2026-09-14",
        time: "08:00",
        doseIn: 19,
        espressoDrink: "Flat White",
      };

      await sql`
        INSERT INTO sync_records
          (user_id, entity, id, payload, updated_at, deleted, server_seq)
        VALUES
          (${userId}, 'brew', ${ownBrewId}, ${sql.json(ownBrew)}, 1000, false, nextval('sync_seq')),
          (${userId}, 'brew', ${quickBrewId}, ${sql.json(quickBrew)}, 1003, false, nextval('sync_seq')),
          (${userId}, 'brew', ${deletedBrewId}, ${sql.json(deletedBrew)}, 1001, true, nextval('sync_seq')),
          (${otherUserId}, 'brew', ${otherBrewId}, ${sql.json(otherBrew)}, 1002, false, nextval('sync_seq'))`;
    } finally {
      await sql.end();
    }

    const listResponse = (await callMcp(userId, {
      jsonrpc: "2.0",
      id: "list-tools",
      method: "tools/list",
      params: {},
    })) as {
      result: { tools: Array<{ name: string }> };
    };
    expect(listResponse.result.tools.map((tool) => tool.name)).toContain(
      "coffee_journal_list_brews",
    );

    const callResponse = (await callMcp(userId, {
      jsonrpc: "2.0",
      id: "list-brews",
      method: "tools/call",
      params: {
        name: "coffee_journal_list_brews",
        arguments: { limit: 10 },
      },
    })) as {
      result: { structuredContent: { brews: unknown[] } };
    };

    expect(callResponse.result.structuredContent).toEqual({
      brews: [
        expect.objectContaining({
          id: quickBrewId,
          method: "espresso",
          rating: null,
        }),
        expect.objectContaining({
          id: ownBrewId,
          method: "V60",
          rating: 8.5,
          flavor: "Stone fruit and caramel",
          recipeNotes: "Use a slightly finer grind next time",
        }),
      ],
    });

    const allMethodsResponse = (await callMcp(userId, {
      jsonrpc: "2.0",
      id: "list-all-methods",
      method: "tools/call",
      params: {
        name: "coffee_journal_list_brews",
        arguments: {
          from: "2026-09-14",
          to: "2026-09-14",
          method: "all",
        },
      },
    })) as { result: { structuredContent: { brews: Array<{ id: string }> } } };
    expect(allMethodsResponse.result.structuredContent.brews).toMatchObject([
      { id: quickBrewId },
    ]);
  });

  it("paginates brews with an opaque stable cursor", async () => {
    const userId = crypto.randomUUID();
    await grantMcpAccess(userId);
    const brews = [
      { id: crypto.randomUUID(), date: "2026-09-13", time: "09:00" },
      { id: crypto.randomUUID(), date: "2026-09-12", time: "09:00" },
      { id: crypto.randomUUID(), date: "2026-09-11", time: "09:00" },
    ].map((brew) => ({
      ...brew,
      beanId: crypto.randomUUID(),
      method: "V60",
      rating: 8,
    }));

    const sql = postgres(integrationContext().databaseUrl);
    try {
      for (const brew of brews) {
        await sql`
          INSERT INTO sync_records
            (user_id, entity, id, payload, updated_at, deleted, server_seq)
          VALUES
            (${userId}, 'brew', ${brew.id}, ${sql.json(brew)}, 2000, false, nextval('sync_seq'))`;
      }
    } finally {
      await sql.end();
    }

    const firstPage = (await callMcp(userId, {
      jsonrpc: "2.0",
      id: "first-page",
      method: "tools/call",
      params: {
        name: "coffee_journal_list_brews",
        arguments: { limit: 2 },
      },
    })) as {
      result: {
        structuredContent: {
          brews: Array<{ id: string }>;
          nextCursor?: string;
        };
      };
    };

    expect(firstPage.result.structuredContent.brews.map(({ id }) => id)).toEqual(
      [brews[0]!.id, brews[1]!.id],
    );
    expect(firstPage.result.structuredContent.nextCursor).toEqual(
      expect.any(String),
    );

    const secondPage = (await callMcp(userId, {
      jsonrpc: "2.0",
      id: "second-page",
      method: "tools/call",
      params: {
        name: "coffee_journal_list_brews",
        arguments: {
          limit: 2,
          cursor: firstPage.result.structuredContent.nextCursor,
        },
      },
    })) as {
      result: {
        structuredContent: {
          brews: Array<{ id: string }>;
          nextCursor?: string;
        };
      };
    };

    expect(
      secondPage.result.structuredContent.brews.map(({ id }) => id),
    ).toEqual([brews[2]!.id]);
    expect(secondPage.result.structuredContent.nextCursor).toBeUndefined();
  });

  it("filters brews by date, method and minimum rating", async () => {
    const userId = crypto.randomUUID();
    await grantMcpAccess(userId);
    const matchingId = crypto.randomUUID();
    const brews = [
      {
        id: matchingId,
        date: "2026-09-10",
        method: "V60",
        rating: 9,
      },
      {
        id: crypto.randomUUID(),
        date: "2026-09-10",
        method: "V60",
        rating: 7,
      },
      {
        id: crypto.randomUUID(),
        date: "2026-09-10",
        method: "Espresso",
        rating: 9,
      },
      {
        id: crypto.randomUUID(),
        date: "2026-08-31",
        method: "V60",
        rating: 9,
      },
    ].map((brew) => ({
      ...brew,
      beanId: crypto.randomUUID(),
      time: "08:00",
    }));

    const sql = postgres(integrationContext().databaseUrl);
    try {
      for (const brew of brews) {
        await sql`
          INSERT INTO sync_records
            (user_id, entity, id, payload, updated_at, deleted, server_seq)
          VALUES
            (${userId}, 'brew', ${brew.id}, ${sql.json(brew)}, 3000, false, nextval('sync_seq'))`;
      }
    } finally {
      await sql.end();
    }

    const response = (await callMcp(userId, {
      jsonrpc: "2.0",
      id: "filtered-brews",
      method: "tools/call",
      params: {
        name: "coffee_journal_list_brews",
        arguments: {
          from: "2026-09-01",
          to: "2026-09-30",
          method: "V60",
          minimumRating: 8,
        },
      },
    })) as {
      result: { structuredContent: { brews: Array<{ id: string }> } };
    };

    expect(response.result.structuredContent.brews.map(({ id }) => id)).toEqual(
      [matchingId],
    );
  });

  it("gets a brew and resolves only the authenticated user's related records", async () => {
    const userId = crypto.randomUUID();
    const otherUserId = crypto.randomUUID();
    const brewId = crypto.randomUUID();
    const beanId = crypto.randomUUID();
    const methodId = crypto.randomUUID();
    const grinderId = crypto.randomUUID();
    const machineId = crypto.randomUUID();
    const recipeId = crypto.randomUUID();
    await grantMcpAccess(userId);

    const brew = {
      id: brewId,
      beanId,
      method: methodId,
      date: "2026-09-13",
      time: "08:30",
      grinder: grinderId,
      machine: machineId,
      grindSetting: 22,
      doseIn: 15,
      yieldOut: 250,
      extractionTime: 180,
      temperature: 94,
      ratio: "1:16.7",
      recipeId,
      recipeNotes: "Three-pour recipe",
      rating: 9,
      flavor: "Apricot and caramel",
    };
    const records = [
      ["brew", brewId, brew],
      ["bean", beanId, { id: beanId, name: "Worka", roaster: "Vanguard" }],
      ["method", methodId, { id: methodId, label: "V60", notes: "Rinse filter" }],
      ["grinder", grinderId, { id: grinderId, name: "K2", maker: "Kingrinder" }],
      ["machine", machineId, { id: machineId, name: "Ceramic V60", maker: "Hario", type: "Pourover" }],
      ["recipe", recipeId, { id: recipeId, name: "Three pour", notes: "Bloom for 45 seconds" }],
    ] as const;

    const sql = postgres(integrationContext().databaseUrl);
    try {
      for (const [entity, id, payload] of records) {
        await sql`
          INSERT INTO sync_records
            (user_id, entity, id, payload, updated_at, deleted, server_seq)
          VALUES
            (${userId}, ${entity}, ${id}, ${sql.json(payload)}, 4000, false, nextval('sync_seq'))`;
      }
      await sql`
        INSERT INTO sync_records
          (user_id, entity, id, payload, updated_at, deleted, server_seq)
        VALUES
          (${otherUserId}, 'brew', ${brewId}, ${sql.json({ ...brew, flavor: "Other user's brew" })}, 4000, false, nextval('sync_seq')),
          (${otherUserId}, 'bean', ${beanId}, ${sql.json({ id: beanId, name: "Other bean", roaster: "Other roaster" })}, 4000, false, nextval('sync_seq'))`;
    } finally {
      await sql.end();
    }

    const response = (await callMcp(userId, {
      jsonrpc: "2.0",
      id: "get-brew",
      method: "tools/call",
      params: {
        name: "coffee_journal_get_brew",
        arguments: { brewId },
      },
    })) as {
      result: {
        structuredContent: {
          brew: {
            id: string;
            flavor?: string;
            bean: { name: string; roaster: string } | null;
            method: { label: string } | null;
            grinder: { name: string } | null;
            machine: { name: string } | null;
            recipe: { name: string } | null;
          } | null;
        };
      };
    };

    expect(response.result.structuredContent.brew).toMatchObject({
      id: brewId,
      flavor: "Apricot and caramel",
      recipeNotes: "Three-pour recipe",
      bean: { name: "Worka", roaster: "Vanguard" },
      method: { label: "V60" },
      grinder: { name: "K2" },
      machine: { name: "Ceramic V60" },
      recipe: { name: "Three pour" },
    });
  });

  it("returns the same result for foreign and nonexistent brew IDs", async () => {
    const ownerId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const foreignBrewId = crypto.randomUUID();
    await grantMcpAccess(userId);

    const sql = postgres(integrationContext().databaseUrl);
    try {
      await sql`
        INSERT INTO sync_records
          (user_id, entity, id, payload, updated_at, deleted, server_seq)
        VALUES
          (${ownerId}, 'brew', ${foreignBrewId}, ${sql.json({ id: foreignBrewId })}, 5000, false, nextval('sync_seq'))`;
    } finally {
      await sql.end();
    }

    const get = async (brewId: string) =>
      (await callMcp(userId, {
        jsonrpc: "2.0",
        id: crypto.randomUUID(),
        method: "tools/call",
        params: {
          name: "coffee_journal_get_brew",
          arguments: { brewId },
        },
      })) as { result: { structuredContent: { brew: unknown } } };

    const foreign = await get(foreignBrewId);
    const missing = await get(crypto.randomUUID());

    expect(foreign.result.structuredContent).toEqual({ brew: null });
    expect(missing.result.structuredContent).toEqual({ brew: null });
  });

  it("lists, filters and paginates only the authenticated user's beans", async () => {
    const userId = crypto.randomUUID();
    const otherUserId = crypto.randomUUID();
    await grantMcpAccess(userId);
    const bean = (
      id: string,
      name: string,
      finished = false,
      roaster = "Vanguard",
    ) => ({
      id,
      name,
      roaster,
      origin: "Ethiopia",
      process: "Washed",
      varietal: "Heirloom",
      roast: "light",
      altitude: "2,000 masl",
      tasting: ["apricot", "caramel"],
      dateOpened: "2026-09-01",
      roastDate: "2026-08-20",
      pricePerKg: 64,
      bagWeight: 250,
      brews: 3,
      ...(finished ? { finished: true } : {}),
    });
    const alpha = bean(crypto.randomUUID(), "Alpha");
    const beta = bean(crypto.randomUUID(), "Beta");
    const finished = bean(crypto.randomUUID(), "Finished", true);
    const deleted = bean(crypto.randomUUID(), "Deleted");
    const foreign = bean(crypto.randomUUID(), "Foreign");

    const sql = postgres(integrationContext().databaseUrl);
    try {
      const records = [alpha, beta, finished, deleted] as const;
      for (const record of records) {
        await sql`
          INSERT INTO sync_records
            (user_id, entity, id, payload, updated_at, deleted, server_seq)
          VALUES
            (${userId}, 'bean', ${record.id}, ${sql.json(record)}, 6000,
             ${record.id === deleted.id}, nextval('sync_seq'))`;
      }
      await sql`
        INSERT INTO sync_records
          (user_id, entity, id, payload, updated_at, deleted, server_seq)
        VALUES
          (${otherUserId}, 'bean', ${foreign.id}, ${sql.json(foreign)}, 6000, false, nextval('sync_seq'))`;
      const firstBrewId = crypto.randomUUID();
      const secondBrewId = crypto.randomUUID();
      await sql`
        INSERT INTO sync_records
          (user_id, entity, id, payload, updated_at, deleted, server_seq)
        VALUES
          (${userId}, 'brew', ${firstBrewId}, ${sql.json({ id: firstBrewId, beanId: alpha.id, doseIn: 18 })}, 6001, false, nextval('sync_seq')),
          (${userId}, 'brew', ${secondBrewId}, ${sql.json({ id: secondBrewId, beanId: alpha.id, doseIn: 20 })}, 6002, false, nextval('sync_seq'))`;
    } finally {
      await sql.end();
    }

    type BeansPage = {
      result: {
        structuredContent: {
          beans: Array<{ id: string; name: string }>;
          nextCursor?: string;
        };
      };
    };
    const list = async (arguments_: Record<string, unknown>) =>
      (await callMcp(userId, {
        jsonrpc: "2.0",
        id: crypto.randomUUID(),
        method: "tools/call",
        params: {
          name: "coffee_journal_list_beans",
          arguments: arguments_,
        },
      })) as BeansPage;

    const firstPage = await list({
      limit: 1,
      status: "active",
      roaster: "Vanguard",
    });
    expect(firstPage.result.structuredContent.beans).toMatchObject([
      {
        id: alpha.id,
        name: "Alpha",
        brews: 2,
        consumedWeight: 38,
        remainingWeight: 212,
      },
    ]);
    expect(firstPage.result.structuredContent.nextCursor).toEqual(
      expect.any(String),
    );

    const secondPage = await list({
      limit: 1,
      status: "active",
      roaster: "Vanguard",
      cursor: firstPage.result.structuredContent.nextCursor,
    });
    expect(secondPage.result.structuredContent.beans).toMatchObject([
      { id: beta.id, name: "Beta" },
    ]);
    expect(secondPage.result.structuredContent.nextCursor).toBeUndefined();

    const finishedPage = await list({ status: "finished" });
    expect(
      finishedPage.result.structuredContent.beans.map(({ id }) => id),
    ).toEqual([finished.id]);

    const allRoasters = await list({ status: "active", roaster: "all" });
    expect(
      allRoasters.result.structuredContent.beans.map(({ id }) => id),
    ).toEqual([alpha.id, beta.id]);
  });

  it("filters brews by bean ID", async () => {
    const userId = crypto.randomUUID();
    const beanId = crypto.randomUUID();
    const matchingBrewId = crypto.randomUUID();
    await grantMcpAccess(userId);
    const brew = (id: string, brewBeanId: string) => ({
      id,
      beanId: brewBeanId,
      method: "V60",
      date: "2026-09-13",
      time: "08:00",
      rating: 8,
    });

    const sql = postgres(integrationContext().databaseUrl);
    try {
      const matching = brew(matchingBrewId, beanId);
      const other = brew(crypto.randomUUID(), crypto.randomUUID());
      await sql`
        INSERT INTO sync_records
          (user_id, entity, id, payload, updated_at, deleted, server_seq)
        VALUES
          (${userId}, 'brew', ${matching.id}, ${sql.json(matching)}, 7000, false, nextval('sync_seq')),
          (${userId}, 'brew', ${other.id}, ${sql.json(other)}, 7000, false, nextval('sync_seq'))`;
    } finally {
      await sql.end();
    }

    const response = (await callMcp(userId, {
      jsonrpc: "2.0",
      id: "brews-by-bean",
      method: "tools/call",
      params: {
        name: "coffee_journal_list_brews",
        arguments: { beanId },
      },
    })) as {
      result: { structuredContent: { brews: Array<{ id: string }> } };
    };

    expect(response.result.structuredContent.brews.map(({ id }) => id)).toEqual(
      [matchingBrewId],
    );
  });

  it("summarizes only the authenticated user's brews in the requested period", async () => {
    const userId = crypto.randomUUID();
    const otherUserId = crypto.randomUUID();
    const v60Id = crypto.randomUUID();
    const espressoId = crypto.randomUUID();
    const beanAId = crypto.randomUUID();
    const beanBId = crypto.randomUUID();
    await grantMcpAccess(userId);
    const brew = (
      id: string,
      beanId: string,
      method: string,
      date: string,
      rating: number | null,
      favorite = false,
    ) => ({
      id,
      beanId,
      method,
      date,
      time: "08:00",
      rating,
      favorite,
    });
    const records = [
      brew(crypto.randomUUID(), beanAId, v60Id, "2026-09-10", 8, true),
      brew(crypto.randomUUID(), beanAId, v60Id, "2026-09-11", 10),
      brew(crypto.randomUUID(), beanBId, espressoId, "2026-09-12", null),
      brew(crypto.randomUUID(), beanBId, espressoId, "2026-08-31", 2),
    ];

    const sql = postgres(integrationContext().databaseUrl);
    try {
      await sql`
        INSERT INTO sync_records
          (user_id, entity, id, payload, updated_at, deleted, server_seq)
        VALUES
          (${userId}, 'method', ${v60Id}, ${sql.json({ id: v60Id, label: "V60" })}, 8000, false, nextval('sync_seq')),
          (${userId}, 'method', ${espressoId}, ${sql.json({ id: espressoId, label: "Espresso" })}, 8000, false, nextval('sync_seq')),
          (${userId}, 'bean', ${beanAId}, ${sql.json({ id: beanAId, name: "Worka", roaster: "Vanguard" })}, 8000, false, nextval('sync_seq')),
          (${userId}, 'bean', ${beanBId}, ${sql.json({ id: beanBId, name: "House Blend", roaster: "Supreme" })}, 8000, false, nextval('sync_seq'))`;
      for (const record of records) {
        await sql`
          INSERT INTO sync_records
            (user_id, entity, id, payload, updated_at, deleted, server_seq)
          VALUES
            (${userId}, 'brew', ${record.id}, ${sql.json(record)}, 8000, false, nextval('sync_seq'))`;
      }
      const foreign = brew(
        crypto.randomUUID(),
        beanAId,
        v60Id,
        "2026-09-10",
        10,
        true,
      );
      const deleted = brew(
        crypto.randomUUID(),
        beanAId,
        v60Id,
        "2026-09-10",
        10,
        true,
      );
      await sql`
        INSERT INTO sync_records
          (user_id, entity, id, payload, updated_at, deleted, server_seq)
        VALUES
          (${otherUserId}, 'brew', ${foreign.id}, ${sql.json(foreign)}, 8000, false, nextval('sync_seq')),
          (${userId}, 'brew', ${deleted.id}, ${sql.json(deleted)}, 8000, true, nextval('sync_seq'))`;
    } finally {
      await sql.end();
    }

    const response = (await callMcp(userId, {
      jsonrpc: "2.0",
      id: "journal-summary",
      method: "tools/call",
      params: {
        name: "coffee_journal_summary",
        arguments: { from: "2026-09-01", to: "2026-09-30" },
      },
    })) as {
      result: { structuredContent: Record<string, unknown> };
    };

    expect(response.result.structuredContent).toEqual({
      period: { from: "2026-09-01", to: "2026-09-30" },
      totalBrews: 3,
      ratedBrews: 2,
      averageRating: 9,
      favoriteBrews: 1,
      topMethods: [
        { methodId: v60Id, label: "V60", brewCount: 2 },
        { methodId: espressoId, label: "Espresso", brewCount: 1 },
      ],
      topBeans: [
        { beanId: beanAId, name: "Worka", roaster: "Vanguard", brewCount: 2 },
        {
          beanId: beanBId,
          name: "House Blend",
          roaster: "Supreme",
          brewCount: 1,
        },
      ],
    });
  });

  it("searches notes with bounded pagination and user isolation", async () => {
    const userId = crypto.randomUUID();
    const otherUserId = crypto.randomUUID();
    await grantMcpAccess(userId);
    const brewId = crypto.randomUUID();
    const beanId = crypto.randomUUID();
    const recipeId = crypto.randomUUID();
    const records = [
      {
        entity: "brew",
        id: brewId,
        updatedAt: 9_003,
        payload: {
          id: brewId,
          date: "2026-09-13",
          recipeNotes: "Caramel sweetness with a longer bloom",
        },
      },
      {
        entity: "bean",
        id: beanId,
        updatedAt: 9_002,
        payload: {
          id: beanId,
          name: "Worka",
          roaster: "Vanguard",
          tasting: ["apricot", "caramel"],
        },
      },
      {
        entity: "recipe",
        id: recipeId,
        updatedAt: 9_001,
        payload: {
          id: recipeId,
          name: "Three pour",
          notes: "Reduce agitation to preserve caramel notes",
        },
      },
    ] as const;

    const sql = postgres(integrationContext().databaseUrl);
    try {
      for (const record of records) {
        await sql`
          INSERT INTO sync_records
            (user_id, entity, id, payload, updated_at, deleted, server_seq)
          VALUES
            (${userId}, ${record.entity}, ${record.id}, ${sql.json(record.payload)},
             ${record.updatedAt}, false, nextval('sync_seq'))`;
      }
      const deletedId = crypto.randomUUID();
      const foreignId = crypto.randomUUID();
      await sql`
        INSERT INTO sync_records
          (user_id, entity, id, payload, updated_at, deleted, server_seq)
        VALUES
          (${userId}, 'method', ${deletedId}, ${sql.json({ id: deletedId, label: "Deleted", notes: "caramel" })}, 9004, true, nextval('sync_seq')),
          (${otherUserId}, 'method', ${foreignId}, ${sql.json({ id: foreignId, label: "Foreign", notes: "caramel" })}, 9005, false, nextval('sync_seq'))`;
    } finally {
      await sql.end();
    }

    type SearchPage = {
      result: {
        structuredContent: {
          results: Array<{ entity: string; id: string }>;
          nextCursor?: string;
        };
      };
    };
    const search = async (arguments_: Record<string, unknown>) =>
      (await callMcp(userId, {
        jsonrpc: "2.0",
        id: crypto.randomUUID(),
        method: "tools/call",
        params: {
          name: "coffee_journal_search_notes",
          arguments: arguments_,
        },
      })) as SearchPage;

    const firstPage = await search({ query: "CARAMEL", limit: 2 });
    expect(firstPage.result.structuredContent.results).toMatchObject([
      { entity: "brew", id: brewId },
      { entity: "bean", id: beanId },
    ]);
    expect(firstPage.result.structuredContent.nextCursor).toEqual(
      expect.any(String),
    );

    const secondPage = await search({
      query: "CARAMEL",
      limit: 2,
      cursor: firstPage.result.structuredContent.nextCursor,
    });
    expect(secondPage.result.structuredContent.results).toMatchObject([
      { entity: "recipe", id: recipeId },
    ]);
    expect(secondPage.result.structuredContent.nextCursor).toBeUndefined();

    const recipesOnly = await search({
      query: "caramel",
      entities: ["recipe"],
    });
    expect(recipesOnly.result.structuredContent.results).toMatchObject([
      { entity: "recipe", id: recipeId },
    ]);

    const allNotes = await search({});
    expect(allNotes.result.structuredContent.results).toHaveLength(3);
  });

  it("accepts null and blank values for optional tool filters", async () => {
    const userId = crypto.randomUUID();
    await grantMcpAccess(userId);

    const callTool = (name: string, arguments_: Record<string, unknown>) =>
      callMcp(userId, {
        jsonrpc: "2.0",
        id: crypto.randomUUID(),
        method: "tools/call",
        params: { name, arguments: arguments_ },
      });

    const beans = (await callTool("coffee_journal_list_beans", {
      cursor: "",
      roaster: null,
      status: "all",
    })) as { result: { structuredContent: unknown; isError?: boolean } };
    expect(beans.result.isError).not.toBe(true);
    expect(beans.result.structuredContent).toEqual({ beans: [] });

    const brews = (await callTool("coffee_journal_list_brews", {
      cursor: null,
      from: "",
      to: null,
      method: "",
      minimumRating: null,
      beanId: "",
    })) as { result: { structuredContent: unknown; isError?: boolean } };
    expect(brews.result.isError).not.toBe(true);
    expect(brews.result.structuredContent).toEqual({ brews: [] });

    const notes = (await callTool("coffee_journal_search_notes", {
      query: "caramel",
      entities: [],
      cursor: "",
    })) as { result: { structuredContent: unknown; isError?: boolean } };
    expect(notes.result.isError).not.toBe(true);
    expect(notes.result.structuredContent).toEqual({ results: [] });

    const summary = (await callTool("coffee_journal_summary", {
      from: null,
      to: "",
    })) as { result: { structuredContent: unknown; isError?: boolean } };
    expect(summary.result.isError).not.toBe(true);
    expect(summary.result.structuredContent).toMatchObject({
      period: { from: null, to: null },
      totalBrews: 0,
    });
  });
});
