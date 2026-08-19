import postgres from "postgres";
import { describe, expect, it } from "vitest";
import { apiUrl, authenticatedHeaders } from "./infrastructure/api.js";
import { integrationContext } from "./infrastructure/global-setup.js";

describe("users", () => {
  it("registers the authenticated user idempotently", async () => {
    const userId = crypto.randomUUID();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fetch(apiUrl("/api/users/me"), {
        method: "POST",
        headers: authenticatedHeaders(userId),
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ registered: true });
    }

    const sql = postgres(integrationContext().databaseUrl);
    try {
      const rows = await sql<{ user_id: string; last_sync_at: Date | null }[]>`
				SELECT user_id, last_sync_at FROM users WHERE user_id = ${userId}`;
      expect(rows).toHaveLength(1);
      expect(rows[0]).toEqual({ user_id: userId, last_sync_at: null });
    } finally {
      await sql.end();
    }
  });

  it("validates public signup requests before calling the identity provider", async () => {
    const response = await fetch(apiUrl("/api/users"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": `invalid-${crypto.randomUUID()}`,
      },
      body: JSON.stringify({
        name: "",
        email: "not-an-email",
        password: "short",
      }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_request" });
  });

  it("maps an unavailable signup identity provider to 503", async () => {
    const response = await fetch(apiUrl("/api/users"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": `unavailable-${crypto.randomUUID()}`,
      },
      body: JSON.stringify({
        name: "Alex Example",
        email: "alex@example.test",
        password: "correct-horse-battery-staple",
      }),
    });

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "identity_provider_unavailable",
    });
  });

  it("rate limits public signup by forwarded client address", async () => {
    const clientIp = `limited-${crypto.randomUUID()}`;
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      const response = await fetch(apiUrl("/api/users"), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": clientIp,
        },
        body: JSON.stringify({ name: "", email: "", password: "" }),
      });
      expect(response.status).toBe(attempt <= 5 ? 400 : 429);
    }
  });
});
