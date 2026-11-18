import { buildApp } from "../src/app.js";
import { ensureOwner, openDatabase, runMigrations } from "../src/db/index.js";
import { systemClock } from "../src/domain/availability.js";
import { overlapGuardsDisabled } from "../src/domain/booking.js";

export function createTestApp(ownerName = "Владелец", fixedNowMs?: number) {
  const db = openDatabase(":memory:");
  runMigrations(db);
  if (overlapGuardsDisabled()) {
    db.exec(`
      DROP TRIGGER IF EXISTS bookings_no_overlap_insert;
      DROP TRIGGER IF EXISTS bookings_no_overlap_update;
    `);
  }
  ensureOwner(db, ownerName);

  return {
    app: buildApp({
      db,
      clock: fixedNowMs === undefined ? systemClock : { now: () => fixedNowMs },
    }),
    db,
  };
}
