import { afterEach, describe, expect, it } from "vitest";
import { createTestApp } from "./testApp.js";

describe("Meeting types API", () => {
  let closeApp: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await closeApp?.();
    closeApp = undefined;
  });

  it("returns an empty public list from SQLite", async () => {
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

  it("returns only active public meeting types", async () => {
    const { app, db } = createTestApp();
    closeApp = async () => {
      await app.close();
      db.close();
    };

    db.prepare(
      "INSERT INTO meeting_types (name, description, duration_min, archived_at_ms) VALUES (?, ?, ?, NULL)",
    ).run("Active", "desc", 30);
    db.prepare(
      "INSERT INTO meeting_types (name, description, duration_min, archived_at_ms) VALUES (?, ?, ?, ?)",
    ).run("Archived", "desc", 30, 123);

    const response = await app.inject({
      method: "GET",
      url: "/api/meeting-types",
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      { id: 1, name: "Active", description: "desc", durationMin: 30 },
    ]);
  });

  it("admin lists active above archived and by id within groups", async () => {
    const { app, db } = createTestApp();
    closeApp = async () => {
      await app.close();
      db.close();
    };

    db.prepare(
      "INSERT INTO meeting_types (id, name, description, duration_min, archived_at_ms) VALUES (5,'A1','',30,NULL)",
    ).run();
    db.prepare(
      "INSERT INTO meeting_types (id, name, description, duration_min, archived_at_ms) VALUES (2,'X1','',30,1000)",
    ).run();
    db.prepare(
      "INSERT INTO meeting_types (id, name, description, duration_min, archived_at_ms) VALUES (3,'A2','',30,NULL)",
    ).run();
    db.prepare(
      "INSERT INTO meeting_types (id, name, description, duration_min, archived_at_ms) VALUES (7,'X2','',30,2000)",
    ).run();

    const response = await app.inject({
      method: "GET",
      url: "/api/admin/meeting-types",
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().map((t: { id: number }) => t.id)).toEqual([
      3, 5, 2, 7,
    ]);
  });

  it("creates and gets an admin meeting type", async () => {
    const { app, db } = createTestApp();
    closeApp = async () => {
      await app.close();
      db.close();
    };

    const created = await app.inject({
      method: "POST",
      url: "/api/admin/meeting-types",
      payload: { name: "  Intro  ", description: "Hello", durationMin: 45 },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      id: 1,
      name: "Intro",
      description: "Hello",
      durationMin: 45,
      archivedAtMs: null,
    });

    const got = await app.inject({
      method: "GET",
      url: "/api/admin/meeting-types/1",
    });
    expect(got.statusCode).toBe(200);
    expect(got.json().name).toBe("Intro");
  });

  it("updates meeting type and keeps archive state", async () => {
    const { app, db } = createTestApp();
    closeApp = async () => {
      await app.close();
      db.close();
    };

    db.prepare(
      "INSERT INTO meeting_types (id, name, description, duration_min, archived_at_ms) VALUES (1,'Old','d',30,999)",
    ).run();

    const response = await app.inject({
      method: "PATCH",
      url: "/api/admin/meeting-types/1",
      payload: { name: "New", description: "", durationMin: 60 },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      id: 1,
      name: "New",
      description: "",
      durationMin: 60,
      archivedAtMs: 999,
    });
  });

  it("validates meeting type fields and boundaries", async () => {
    const { app, db } = createTestApp();
    closeApp = async () => {
      await app.close();
      db.close();
    };

    const badDurations = [14, 541, 16, 15.5];
    for (const durationMin of badDurations) {
      const res = await app.inject({
        method: "POST",
        url: "/api/admin/meeting-types",
        payload: { name: "X", description: "", durationMin },
      });
      expect(res.statusCode).toBe(422);
      expect(res.json().code).toBe("validation_error");
    }

    for (const durationMin of [15, 45, 540]) {
      const res = await app.inject({
        method: "POST",
        url: "/api/admin/meeting-types",
        payload: { name: `D${durationMin}`, description: "", durationMin },
      });
      expect(res.statusCode).toBe(201);
    }

    const emptyName = await app.inject({
      method: "POST",
      url: "/api/admin/meeting-types",
      payload: { name: "   ", description: "", durationMin: 30 },
    });
    expect(emptyName.statusCode).toBe(422);

    const longDesc = await app.inject({
      method: "POST",
      url: "/api/admin/meeting-types",
      payload: { name: "Ok", description: "a".repeat(2001), durationMin: 30 },
    });
    expect(longDesc.statusCode).toBe(422);
  });

  it("returns 400 for invalid id and 404 for missing", async () => {
    const { app, db } = createTestApp();
    closeApp = async () => {
      await app.close();
      db.close();
    };

    const bad = await app.inject({
      method: "GET",
      url: "/api/admin/meeting-types/abc",
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().code).toBe("invalid_request");

    const missing = await app.inject({
      method: "GET",
      url: "/api/admin/meeting-types/999",
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().code).toBe("not_found");
  });

  it("allows duplicate names", async () => {
    const { app, db } = createTestApp();
    closeApp = async () => {
      await app.close();
      db.close();
    };

    for (const _ of [1, 2]) {
      const res = await app.inject({
        method: "POST",
        url: "/api/admin/meeting-types",
        payload: { name: "Same", description: "", durationMin: 30 },
      });
      expect(res.statusCode).toBe(201);
    }
  });
});
