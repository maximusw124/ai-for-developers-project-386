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

  it("updates an active meeting type", async () => {
    const { app, db } = createTestApp();
    closeApp = async () => {
      await app.close();
      db.close();
    };

    db.prepare(
      "INSERT INTO meeting_types (id, name, description, duration_min, archived_at_ms) VALUES (1,'Old','d',30,NULL)",
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
      archivedAtMs: null,
    });
  });

  it("rejects editing an archived meeting type and keeps it unchanged", async () => {
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
    expect(response.statusCode).toBe(422);
    expect(response.json().code).toBe("validation_error");

    const stored = db
      .prepare(
        "SELECT name, description, duration_min AS durationMin, archived_at_ms AS archivedAtMs FROM meeting_types WHERE id = 1",
      )
      .get();
    expect(stored).toEqual({
      name: "Old",
      description: "d",
      durationMin: 30,
      archivedAtMs: 999,
    });
  });

  it("archives and restores a meeting type, hiding it from public endpoints", async () => {
    const { app, db } = createTestApp();
    closeApp = async () => {
      await app.close();
      db.close();
    };

    db.prepare(
      "INSERT INTO meeting_types (id, name, description, duration_min, archived_at_ms) VALUES (1,'Active','desc',30,NULL)",
    ).run();

    const archived = await app.inject({
      method: "POST",
      url: "/api/admin/meeting-types/1/archive",
    });
    expect(archived.statusCode).toBe(200);
    expect(archived.json()).toMatchObject({
      id: 1,
      name: "Active",
      archivedAtMs: expect.any(Number),
    });

    const publicList = await app.inject({
      method: "GET",
      url: "/api/meeting-types",
    });
    expect(publicList.json()).toEqual([]);

    const publicType = await app.inject({
      method: "GET",
      url: "/api/meeting-types/1",
    });
    expect(publicType.statusCode).toBe(404);
    expect(publicType.json().code).toBe("not_found");

    const availability = await app.inject({
      method: "GET",
      url: "/api/meeting-types/1/availability",
    });
    expect(availability.statusCode).toBe(404);

    const booking = await app.inject({
      method: "POST",
      url: "/api/bookings",
      payload: { meetingTypeId: 1 },
    });
    expect(booking.statusCode).toBe(404);

    const adminType = await app.inject({
      method: "GET",
      url: "/api/admin/meeting-types/1",
    });
    expect(adminType.statusCode).toBe(200);
    expect(adminType.json().archivedAtMs).toEqual(expect.any(Number));

    const restored = await app.inject({
      method: "POST",
      url: "/api/admin/meeting-types/1/restore",
    });
    expect(restored.statusCode).toBe(200);
    expect(restored.json().archivedAtMs).toBeNull();

    const publicListAfter = await app.inject({
      method: "GET",
      url: "/api/meeting-types",
    });
    expect(publicListAfter.json()).toEqual([
      { id: 1, name: "Active", description: "desc", durationMin: 30 },
    ]);

    const publicTypeAfter = await app.inject({
      method: "GET",
      url: "/api/meeting-types/1",
    });
    expect(publicTypeAfter.statusCode).toBe(200);
  });

  it("keeps archive idempotent and allows editing after restore", async () => {
    const { app, db } = createTestApp();
    closeApp = async () => {
      await app.close();
      db.close();
    };

    db.prepare(
      "INSERT INTO meeting_types (id, name, description, duration_min, archived_at_ms) VALUES (1,'Active','',30,NULL)",
    ).run();

    const first = await app.inject({
      method: "POST",
      url: "/api/admin/meeting-types/1/archive",
    });
    const archivedAtMs = first.json().archivedAtMs;

    const second = await app.inject({
      method: "POST",
      url: "/api/admin/meeting-types/1/archive",
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().archivedAtMs).toBe(archivedAtMs);

    const restore = await app.inject({
      method: "POST",
      url: "/api/admin/meeting-types/1/restore",
    });
    expect(restore.statusCode).toBe(200);
    expect(restore.json().archivedAtMs).toBeNull();

    const update = await app.inject({
      method: "PATCH",
      url: "/api/admin/meeting-types/1",
      payload: { name: "Renamed", description: "", durationMin: 45 },
    });
    expect(update.statusCode).toBe(200);
    expect(update.json().name).toBe("Renamed");
  });

  it("returns 400 for invalid id and 404 for missing on archive and restore", async () => {
    const { app, db } = createTestApp();
    closeApp = async () => {
      await app.close();
      db.close();
    };

    for (const action of ["archive", "restore"]) {
      const bad = await app.inject({
        method: "POST",
        url: `/api/admin/meeting-types/abc/${action}`,
      });
      expect(bad.statusCode).toBe(400);
      expect(bad.json().code).toBe("invalid_request");

      const missing = await app.inject({
        method: "POST",
        url: `/api/admin/meeting-types/999/${action}`,
      });
      expect(missing.statusCode).toBe(404);
      expect(missing.json().code).toBe("not_found");
    }
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
