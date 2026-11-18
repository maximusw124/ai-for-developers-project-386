import { afterEach, describe, expect, it } from "vitest";
import { createTestApp } from "./testApp.js";

const NOW = Date.parse("2026-11-16T05:00:00.000Z");

describe("Slot conflict protection", () => {
  let closeApp: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await closeApp?.();
    closeApp = undefined;
  });

  function setup() {
    const context = createTestApp("Владелец", NOW);
    closeApp = async () => {
      await context.app.close();
      context.db.close();
    };
    return context;
  }

  function insertType(db: ReturnType<typeof createTestApp>["db"]): number {
    const info = db
      .prepare(
        "INSERT INTO meeting_types (name, description, duration_min, archived_at_ms) VALUES ('Short', '', 30, NULL)",
      )
      .run();
    return Number(info.lastInsertRowid);
  }

  const payload = (meetingTypeId: number) => ({
    meetingTypeId,
    start: "2026-11-16T06:00:00.000Z",
    guestName: "Гость",
    guestEmail: "guest@example.com",
  });

  it("returns 409 slot_taken and creates no second booking for an overlapping slot", async () => {
    const { app, db } = setup();
    const short = insertType(db);
    const other = insertType(db);

    const first = await app.inject({
      method: "POST",
      url: "/api/bookings",
      payload: payload(short),
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: "POST",
      url: "/api/bookings",
      payload: { ...payload(other), guestName: "Другой гость" },
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().code).toBe("slot_taken");
    expect(db.prepare("SELECT COUNT(*) AS count FROM bookings").get()).toEqual({
      count: 1,
    });
  });

  it("rejects overlapping bookings inserted directly with SQL", () => {
    const { db } = setup();
    const short = insertType(db);
    const other = insertType(db);
    const startMs = Date.parse("2026-11-16T06:00:00.000Z");
    const insert = db.prepare(
      `INSERT INTO bookings
        (meeting_type_id, start_ms, end_ms, guest_name, guest_email, comment, created_at_ms)
       VALUES (?, ?, ?, 'Гость', 'guest@example.com', NULL, ?)`,
    );

    insert.run(short, startMs, startMs + 30 * 60_000, NOW);

    expect(() =>
      insert.run(other, startMs + 15 * 60_000, startMs + 45 * 60_000, NOW),
    ).toThrow("booking_overlap");
  });
});
