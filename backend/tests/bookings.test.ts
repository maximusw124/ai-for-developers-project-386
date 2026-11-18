import { afterEach, describe, expect, it } from "vitest";
import { createTestApp } from "./testApp.js";

const NOW = Date.parse("2026-11-16T05:00:00.000Z");

function setup(ownerName = "Владелец") {
  const context = createTestApp(ownerName, NOW);
  return context;
}

function insertType(
  db: ReturnType<typeof createTestApp>["db"],
  name: string,
  durationMin = 30,
  archivedAtMs: number | null = null,
): number {
  const info = db
    .prepare(
      "INSERT INTO meeting_types (name, description, duration_min, archived_at_ms) VALUES (?, ?, ?, ?)",
    )
    .run(name, `${name} description`, durationMin, archivedAtMs);
  return Number(info.lastInsertRowid);
}

function bookingPayload(
  meetingTypeId: number,
  start = "2026-11-16T06:00:00.000Z",
) {
  return {
    meetingTypeId,
    start,
    guestName: "  Гость  ",
    guestEmail: "guest@example.com",
    comment: "Вопрос",
  };
}

describe("Create booking API", () => {
  let closeApp: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await closeApp?.();
    closeApp = undefined;
  });

  function track<T extends ReturnType<typeof createTestApp>>(context: T): T {
    closeApp = async () => {
      await context.app.close();
      context.db.close();
    };
    return context;
  }

  it("creates a booking and returns everything for the confirmation screen", async () => {
    const { app, db } = track(setup("Иван"));
    const id = insertType(db, "Консультация", 45);

    const response = await app.inject({
      method: "POST",
      url: "/api/bookings",
      payload: {
        ...bookingPayload(id),
        start: "2026-11-16T06:00:00.000Z",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      meetingType: {
        id,
        name: "Консультация",
        description: "Консультация description",
        durationMin: 45,
      },
      start: "2026-11-16T06:00:00.000Z",
      end: "2026-11-16T06:45:00.000Z",
      durationMin: 45,
      ownerName: "Иван",
      guestName: "Гость",
      guestEmail: "guest@example.com",
      comment: "Вопрос",
      createdAt: new Date(NOW).toISOString(),
    });

    const stored = db
      .prepare(
        "SELECT meeting_type_id AS meetingTypeId, start_ms AS startMs, end_ms AS endMs FROM bookings",
      )
      .get();
    expect(stored).toEqual({
      meetingTypeId: id,
      startMs: Date.parse("2026-11-16T06:00:00.000Z"),
      endMs: Date.parse("2026-11-16T06:45:00.000Z"),
    });
  });

  it("removes the booked slot from availability and allows adjacent bookings", async () => {
    const { app, db } = track(setup());
    const id = insertType(db, "Short", 30);

    const created = await app.inject({
      method: "POST",
      url: "/api/bookings",
      payload: bookingPayload(id),
    });
    expect(created.statusCode).toBe(201);

    const adjacent = await app.inject({
      method: "POST",
      url: "/api/bookings",
      payload: bookingPayload(id, "2026-11-16T06:30:00.000Z"),
    });
    expect(adjacent.statusCode).toBe(201);

    const availability = await app.inject({
      method: "GET",
      url: `/api/meeting-types/${id}/availability`,
    });
    const starts = availability
      .json()
      .days[0].slots.map((slot: { start: string }) => slot.start);
    expect(starts).not.toContain("2026-11-16T06:00:00.000Z");
    expect(starts).not.toContain("2026-11-16T06:30:00.000Z");
    expect(starts).toContain("2026-11-16T07:00:00.000Z");
  });

  it("rejects invalid request bodies and invalid guest fields", async () => {
    const { app, db } = track(setup());
    const id = insertType(db, "Consultation");

    for (const payload of [null, [], "text"]) {
      const response = await app.inject({
        method: "POST",
        url: "/api/bookings",
        payload: JSON.stringify(payload),
        headers: { "content-type": "application/json" },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe("invalid_request");
    }

    const badId = await app.inject({
      method: "POST",
      url: "/api/bookings",
      payload: { ...bookingPayload(id), meetingTypeId: "1" },
    });
    expect(badId.statusCode).toBe(400);
    expect(badId.json().code).toBe("invalid_request");

    const invalid = await app.inject({
      method: "POST",
      url: "/api/bookings",
      payload: {
        meetingTypeId: id,
        start: "not-a-date",
        guestName: "   ",
        guestEmail: "not-an-email",
        comment: "x".repeat(2001),
      },
    });
    expect(invalid.statusCode).toBe(422);
    expect(invalid.json().code).toBe("validation_error");
    expect(
      invalid.json().fieldErrors.map((f: { field: string }) => f.field),
    ).toEqual(
      expect.arrayContaining(["start", "guestName", "guestEmail", "comment"]),
    );
    expect(db.prepare("SELECT COUNT(*) AS count FROM bookings").get()).toEqual({
      count: 0,
    });
  });

  it("rejects slots outside the schedule with slot_unavailable", async () => {
    const { app, db } = track(setup());
    const shortId = insertType(db, "Short", 30);
    const longId = insertType(db, "Long", 60);
    const archivedId = insertType(db, "Archived", 30, 1);

    for (const start of [
      "2026-11-16T05:00:00.000Z",
      "2026-11-16T06:15:00.000Z",
      "2026-11-21T06:00:00.000Z",
      "2026-11-30T06:00:00.000Z",
      "2026-11-16T04:30:00.000Z",
    ]) {
      const response = await app.inject({
        method: "POST",
        url: "/api/bookings",
        payload: bookingPayload(shortId, start),
      });
      expect(response.statusCode).toBe(422);
      expect(response.json().code).toBe("slot_unavailable");
    }

    const tooLate = await app.inject({
      method: "POST",
      url: "/api/bookings",
      payload: bookingPayload(longId, "2026-11-16T14:30:00.000Z"),
    });
    expect(tooLate.statusCode).toBe(422);
    expect(tooLate.json().code).toBe("slot_unavailable");

    for (const meetingTypeId of [archivedId, 9999]) {
      const response = await app.inject({
        method: "POST",
        url: "/api/bookings",
        payload: bookingPayload(meetingTypeId),
      });
      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe("not_found");
    }

    expect(db.prepare("SELECT COUNT(*) AS count FROM bookings").get()).toEqual({
      count: 0,
    });
  });

  it("accepts a booking without a comment", async () => {
    const { app, db } = track(setup());
    const id = insertType(db, "No comment");
    const { comment: _comment, ...payload } = bookingPayload(id);

    const response = await app.inject({
      method: "POST",
      url: "/api/bookings",
      payload,
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().comment).toBeUndefined();
  });
});
