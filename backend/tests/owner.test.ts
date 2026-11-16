import { afterEach, describe, expect, it } from "vitest";
import { ensureOwner, openDatabase, runMigrations } from "../src/db/index.js";

describe("Owner seed", () => {
  const databases: Array<ReturnType<typeof openDatabase>> = [];

  afterEach(() => {
    for (const db of databases.splice(0)) {
      db.close();
    }
  });

  it("creates migrations and seeds a single owner idempotently", () => {
    const db = openDatabase(":memory:");
    databases.push(db);
    runMigrations(db);

    ensureOwner(db, "Владелец");
    ensureOwner(db, "Другое имя");

    const owners = db
      .prepare("SELECT id, display_name AS displayName FROM owner")
      .all();

    expect(owners).toEqual([{ id: 1, displayName: "Владелец" }]);
  });

  it("uses the provided owner name on first seed", () => {
    const db = openDatabase(":memory:");
    databases.push(db);
    runMigrations(db);

    ensureOwner(db, "Анна");

    expect(
      db.prepare("SELECT display_name FROM owner WHERE id = 1").pluck().get(),
    ).toBe("Анна");
  });

  it("isolates state between in-memory databases", () => {
    const first = openDatabase(":memory:");
    const second = openDatabase(":memory:");
    databases.push(first, second);

    runMigrations(first);
    runMigrations(second);
    first
      .prepare(
        "INSERT INTO meeting_types (name, description, duration_min) VALUES (?, ?, ?)",
      )
      .run("Только в первой", "", 30);

    expect(
      first.prepare("SELECT COUNT(*) FROM meeting_types").pluck().get(),
    ).toBe(1);
    expect(
      second.prepare("SELECT COUNT(*) FROM meeting_types").pluck().get(),
    ).toBe(0);
  });
});
