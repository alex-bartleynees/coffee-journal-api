import { describe, expect, it } from "vitest";
import { apiUrl } from "./infrastructure/api.js";

describe("health", () => {
  it("reports healthy through the real HTTP server", async () => {
    const response = await fetch(apiUrl("/health"));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
  });
});
