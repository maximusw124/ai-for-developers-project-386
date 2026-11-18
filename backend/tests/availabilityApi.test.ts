import { afterEach, describe, expect, it } from "vitest";
import { createTestApp } from "./testApp.js";

const MONDAY_0800_MSK = Date.parse("2026-11-16T05:00:00.000Z");

function insertType(
  db: ReturnType<typeof createTestApp>["db"],
  name: string,
  durationMin: number,
  archivedAtMs: number | null = null,
): number {
  const info = db
    .prepare(
      "INSERT INTO meeting_types (name, description, duration_min, archived_at_ms) VALUES (?, ?, ?, ?)",
    )
    .run(name, `${name} description`, durationMin, archivedAtMs);
  return Number(info.lastInsertRowid);
}

function insertBooking(
  db: ReturnType<typeof createTestApp>["db"],
  meetingTypeId: number,
  startMs: number,
  endMs: number,
): void {
  db.prepare(
    `INSERT INTO bookings
      (meeting_type_id, start_ms, end_ms, guest_name, guest_email, comment, created_at_ms)
     VALUES (?, ?, ?, 'Guest', 'guest@example.com', NULL, ?)`,
  ).run(meetingTypeId, startMs, endMs, startMs);
}

describe("Availability API", () => {
  let closeApp: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await closeApp?.();
    closeApp = undefined;
  });

  function setup(fixedNowMs = MONDAY_0800_MSK) {
    const context = createTestApp("Владелец", fixedNowMs);
    closeApp = async () => {
      await context.app.close();
      context.db.close();
    };
    return context;
  }

  it("returns the type and exactly 14 Moscow days with UTC slot instants", async () => {
    const { app, db } = setup();
    const id = insertType(db, "Consultation", 45);

    const response = await app.inject({
      method: "GET",
      url: `/api/meeting-types/${id}/availability`,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.meetingType).toEqual({
      id,
      name: "Consultation",
      description: "Consultation description",
      durationMin: 45,
    });
    expect(body.days).toHaveLength(14);
    expect(body.days[0].date).toBe("2026-11-16");
    expect(body.days[13].date).toBe("2026-11-29");
    expect(body.days[0].slots[0]).toEqual({
      start: "2026-11-16T06:00:00.000Z",
      end: "2026-11-16T06:45:00.000Z",
    });
    expect(body.days[0].slots.at(-1)).toEqual({
      start: "2026-11-16T14:00:00.000Z",
      end: "2026-11-16T14:45:00.000Z",
    });
    for (const day of body.days) {
      expect(day.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      for (const slot of day.slots) {
        expect(slot.start).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
        expect(slot.end).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
        expect(Date.parse(slot.end)).toBeGreaterThan(Date.parse(slot.start));
      }
    }
  });

  it("keeps weekends and past time as empty days in the window", async () => {
    const { app, db } = setup(Date.parse("2026-11-21T07:00:00.000Z"));
    const id = insertType(db, "Consultation", 30);

    const weekend = await app.inject({
      method: "GET",
      url: `/api/meeting-types/${id}/availability`,
    });
    const weekendBody = weekend.json();
    expect(weekendBody.days[0]).toMatchObject({
      date: "2026-11-21",
      slots: [],
    });
    expect(weekendBody.days[1]).toMatchObject({
      date: "2026-11-22",
      slots: [],
    });
    expect(weekendBody.days[2].slots[0].start).toBe("2026-11-23T06:00:00.000Z");

    await closeApp?.();
    closeApp = undefined;

    const evening = setup(Date.parse("2026-11-16T15:30:00.000Z"));
    const eveningId = insertType(evening.db, "Consultation", 30);
    const afterWork = await evening.app.inject({
      method: "GET",
      url: `/api/meeting-types/${eveningId}/availability`,
    });
    const afterWorkBody = afterWork.json();
    expect(afterWorkBody.days[0].date).toBe("2026-11-16");
    expect(afterWorkBody.days[0].slots).toEqual([]);
    expect(afterWorkBody.days[1].slots[0].start).toBe(
      "2026-11-17T06:00:00.000Z",
    );
  });

  it("applies bookings of every type and allows adjacent slots", async () => {
    const { app, db } = setup();
    const firstType = insertType(db, "Short", 30);
    const otherType = insertType(db, "Long", 60);
    insertBooking(
      db,
      otherType,
      Date.parse("2026-11-16T07:00:00.000Z"),
      Date.parse("2026-11-16T08:00:00.000Z"),
    );
    insertBooking(
      db,
      firstType,
      Date.parse("2026-11-16T08:00:00.000Z"),
      Date.parse("2026-11-16T09:00:00.000Z"),
    );

    const response = await app.inject({
      method: "GET",
      url: `/api/meeting-types/${firstType}/availability`,
    });
    const starts: string[] = response
      .json()
      .days[0].slots.map((slot: { start: string }) => slot.start);

    expect(starts).toContain("2026-11-16T06:30:00.000Z");
    expect(starts).not.toContain("2026-11-16T07:00:00.000Z");
    expect(starts).not.toContain("2026-11-16T07:30:00.000Z");
    expect(starts).not.toContain("2026-11-16T08:00:00.000Z");
    expect(starts).not.toContain("2026-11-16T08:30:00.000Z");
    expect(starts).toContain("2026-11-16T09:00:00.000Z");
  });

  it("rejects invalid ids and hides unknown or archived types", async () => {
    const { app, db } = setup();
    const activeId = insertType(db, "Active", 30);
    const archivedId = insertType(db, "Archived", 30, 1);

    for (const url of [
      "/api/meeting-types/abc/availability",
      "/api/meeting-types/0/availability",
    ]) {
      const response = await app.inject({ method: "GET", url });
      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe("invalid_request");
    }

    const missing = await app.inject({
      method: "GET",
      url: `/api/meeting-types/${activeId + 100}/availability`,
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().code).toBe("not_found");

    const archived = await app.inject({
      method: "GET",
      url: `/api/meeting-types/${archivedId}/availability`,
    });
    expect(archived.statusCode).toBe(404);
    expect(archived.json().code).toBe("not_found");
  });
});
