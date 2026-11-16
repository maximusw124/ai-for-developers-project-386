import { afterEach, describe, expect, it } from "vitest";
import { ensureOwner, openDatabase, runMigrations } from "../src/db/index.js";
import { createTestApp } from "./testApp.js";

describe("Owner", () => {
  const databases: Array<ReturnType<typeof openDatabase>> = [];
  let closeApp: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await closeApp?.();
    closeApp = undefined;
    for (const db of databases.splice(0)) db.close();
  });

  it("creates migrations and seeds a single owner idempotently", () => {
    const db = openDatabase(":memory:");
    databases.push(db);
    runMigrations(db);

    ensureOwner(db, "Owner");
    ensureOwner(db, "Other");

    const owners = db
      .prepare("SELECT id, display_name AS displayName FROM owner")
      .all();
    expect(owners).toEqual([{ id: 1, displayName: "Owner" }]);
  });

  it("GET /api/admin/owner returns owner and PATCH updates trimmed name", async () => {
    const { app, db } = createTestApp("Initial");
    closeApp = async () => {
      await app.close();
      db.close();
    };

    const got = await app.inject({ method: "GET", url: "/api/admin/owner" });
    expect(got.statusCode).toBe(200);
    expect(got.json()).toEqual({ displayName: "Initial" });

    const patched = await app.inject({
      method: "PATCH",
      url: "/api/admin/owner",
      payload: { displayName: "  New Name  " },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json()).toEqual({ displayName: "New Name" });

    const got2 = await app.inject({ method: "GET", url: "/api/admin/owner" });
    expect(got2.json()).toEqual({ displayName: "New Name" });
  });

  it("PATCH /api/admin/owner rejects empty trimmed name with 422", async () => {
    const { app, db } = createTestApp("Initial");
    closeApp = async () => {
      await app.close();
      db.close();
    };

    const res = await app.inject({
      method: "PATCH",
      url: "/api/admin/owner",
      payload: { displayName: "   " },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe("validation_error");
  });
});
