import { afterEach, describe, expect, it } from "vitest";
import { createTestApp } from "./testApp.js";

describe("Smoke test", () => {
  let closeApp: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await closeApp?.();
    closeApp = undefined;
  });

  it("GET /api/health returns 200 OK", async () => {
    const { app, db } = createTestApp();
    closeApp = async () => {
      await app.close();
      db.close();
    };

    const response = await app.inject({
      method: "GET",
      url: "/api/health",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });
});
