import { afterEach, describe, expect, it } from "vitest";
import { createTestApp } from "./testApp.js";

const NOW = Date.parse("2026-11-16T05:00:00.000Z");

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
  start: string,
  end: string,
  guestName: string,
  comment: string | null = null,
): number {
  const info = db
    .prepare(
      `INSERT INTO bookings
       (meeting_type_id, start_ms, end_ms, guest_name, guest_email, comment, created_at_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      meetingTypeId,
      Date.parse(start),
      Date.parse(end),
      guestName,
      `${guestName.toLowerCase()}@example.com`,
      comment,
      NOW,
    );
  return Number(info.lastInsertRowid);
}

describe("List upcoming bookings API", () => {
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

  function setup() {
    return track(createTestApp("Владелец", NOW));
  }

  it("returns an empty list when there are no upcoming bookings", async () => {
    const { app } = setup();

    const response = await app.inject({
      method: "GET",
      url: "/api/admin/bookings/upcoming",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);
  });

  it("includes ongoing and future bookings, excludes finished ones, and sorts by start", async () => {
    const { app, db } = setup();
    const activeId = insertType(db, "Консультация", 30);
    const archivedId = insertType(db, "Архивная встреча", 60, 1);
    const futureId = insertBooking(
      db,
      activeId,
      "2026-11-16T06:30:00.000Z",
      "2026-11-16T07:00:00.000Z",
      "Будущий",
      "Вопрос про тариф",
    );
    const archivedBookingId = insertBooking(
      db,
      archivedId,
      "2026-11-16T07:30:00.000Z",
      "2026-11-16T08:30:00.000Z",
      "Архивный",
    );
    const ongoingId = insertBooking(
      db,
      activeId,
      "2026-11-16T05:00:00.000Z",
      "2026-11-16T06:00:00.000Z",
      "Сейчас",
    );
    insertBooking(
      db,
      activeId,
      "2026-11-16T00:00:00.000Z",
      "2026-11-16T01:00:00.000Z",
      "Прошлый",
    );
    insertBooking(
      db,
      activeId,
      "2026-11-16T02:00:00.000Z",
      "2026-11-16T05:00:00.000Z",
      "Граница",
    );

    const response = await app.inject({
      method: "GET",
      url: "/api/admin/bookings/upcoming",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      {
        id: ongoingId,
        start: "2026-11-16T05:00:00.000Z",
        end: "2026-11-16T06:00:00.000Z",
        guestName: "Сейчас",
        guestEmail: "сейчас@example.com",
        comment: null,
        createdAt: new Date(NOW).toISOString(),
        meetingType: {
          id: activeId,
          name: "Консультация",
          durationMin: 30,
          archived: false,
        },
      },
      {
        id: futureId,
        start: "2026-11-16T06:30:00.000Z",
        end: "2026-11-16T07:00:00.000Z",
        guestName: "Будущий",
        guestEmail: "будущий@example.com",
        comment: "Вопрос про тариф",
        createdAt: new Date(NOW).toISOString(),
        meetingType: {
          id: activeId,
          name: "Консультация",
          durationMin: 30,
          archived: false,
        },
      },
      {
        id: archivedBookingId,
        start: "2026-11-16T07:30:00.000Z",
        end: "2026-11-16T08:30:00.000Z",
        guestName: "Архивный",
        guestEmail: "архивный@example.com",
        comment: null,
        createdAt: new Date(NOW).toISOString(),
        meetingType: {
          id: archivedId,
          name: "Архивная встреча",
          durationMin: 60,
          archived: true,
        },
      },
    ]);
  });
});
