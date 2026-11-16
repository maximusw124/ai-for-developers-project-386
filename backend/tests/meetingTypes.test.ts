import { afterEach, describe, expect, it } from "vitest";
import { createTestApp } from "./testApp.js";

describe("GET /api/meeting-types", () => {
  let closeApp: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await closeApp?.();
    closeApp = undefined;
  });

  it("returns an empty list from SQLite", async () => {
    const { app, db } = createTestApp();
    closeApp = async () => {
      await app.close();
      db.close();
    };

    const response = await app.inject({
      method: "GET",
      url: "/api/meeting-types",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);
  });

  it("returns public meeting types from SQLite", async () => {
    const { app, db } = createTestApp();
    closeApp = async () => {
      await app.close();
      db.close();
    };

    db.prepare(
      "INSERT INTO meeting_types (name, description, duration_min) VALUES (?, ?, ?)",
    ).run("Консультация", "Разбор задачи", 45);

    const response = await app.inject({
      method: "GET",
      url: "/api/meeting-types",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      {
        id: 1,
        name: "Консультация",
        description: "Разбор задачи",
        durationMin: 45,
      },
    ]);
  });
});
