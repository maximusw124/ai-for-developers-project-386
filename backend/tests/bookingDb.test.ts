import { describe, expect, it } from "vitest";
import { openDatabase, runMigrations } from "../src/db/index.js";

const NOW = Date.parse("2026-11-16T05:00:00.000Z");

function setup() {
  const db = openDatabase(":memory:");
  runMigrations(db);
  return db;
}

function insertType(db: ReturnType<typeof setup>): number {
  return Number(
    db
      .prepare(
        "INSERT INTO meeting_types (name, description, duration_min, archived_at_ms) VALUES ('Short', '', 30, NULL)",
      )
      .run().lastInsertRowid,
  );
}

describe("bookings schema", () => {
  it("applies migrations idempotently with indexes and overlap triggers", () => {
    const db = setup();
    runMigrations(db);

    expect(
      db.prepare("SELECT COUNT(*) AS count FROM schema_migrations").get(),
    ).toEqual({ count: 3 });
    const objects = db
      .prepare(
        "SELECT name, type FROM sqlite_master WHERE name LIKE 'idx_bookings%' OR name LIKE 'bookings_no_overlap%' ORDER BY name",
      )
      .all();
    expect(objects).toEqual([
      { name: "bookings_no_overlap_insert", type: "trigger" },
      { name: "bookings_no_overlap_update", type: "trigger" },
      { name: "idx_bookings_meeting_type", type: "index" },
      { name: "idx_bookings_start_end", type: "index" },
    ]);
    expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(db.pragma("busy_timeout", { simple: true })).toBe(5000);
    db.close();
  });

  it("enforces end > start and the meeting type foreign key", () => {
    const db = setup();
    const typeId = insertType(db);
    const startMs = Date.parse("2026-11-16T06:00:00.000Z");
    const insert = db.prepare(
      `INSERT INTO bookings
        (meeting_type_id, start_ms, end_ms, guest_name, guest_email, comment, created_at_ms)
       VALUES (?, ?, ?, 'Гость', 'guest@example.com', NULL, ?)`,
    );

    expect(() => insert.run(typeId, startMs, startMs, NOW)).toThrow(
      "CHECK constraint failed",
    );
    expect(() =>
      insert.run(typeId + 99, startMs, startMs + 30 * 60_000, NOW),
    ).toThrow("FOREIGN KEY constraint failed");
    db.close();
  });

  it("blocks an update that moves a booking into an occupied interval", () => {
    const db = setup();
    const typeId = insertType(db);
    const startMs = Date.parse("2026-11-16T06:00:00.000Z");
    const insert = db.prepare(
      `INSERT INTO bookings
        (meeting_type_id, start_ms, end_ms, guest_name, guest_email, comment, created_at_ms)
       VALUES (?, ?, ?, 'Гость', 'guest@example.com', NULL, ?)`,
    );
    insert.run(typeId, startMs, startMs + 30 * 60_000, NOW);
    const other = insert.run(
      typeId,
      startMs + 60 * 60_000,
      startMs + 90 * 60_000,
      NOW,
    );

    expect(() =>
      db
        .prepare("UPDATE bookings SET start_ms = ? WHERE id = ?")
        .run(startMs + 15 * 60_000, Number(other.lastInsertRowid)),
    ).toThrow("booking_overlap");
    db.close();
  });
});
