import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

describe("Smoke test", () => {
  it("GET /api/health returns 200 OK", async () => {
    const app = buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/health",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });
});
