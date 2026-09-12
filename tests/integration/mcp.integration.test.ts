import { describe, expect, it } from "vitest";
import { apiUrl } from "./infrastructure/api.js";

describe("MCP", () => {
  it("is unavailable unless explicitly enabled", async () => {
    const response = await fetch(apiUrl("/mcp"), { method: "POST" });

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Not Found");
  });
});
