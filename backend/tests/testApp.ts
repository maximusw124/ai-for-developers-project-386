import { buildApp } from "../src/app.js";
import { ensureOwner, openDatabase, runMigrations } from "../src/db/index.js";
import { systemClock } from "../src/domain/availability.js";

export function createTestApp(ownerName = "Владелец", fixedNowMs?: number) {
  const db = openDatabase(":memory:");
  runMigrations(db);
  ensureOwner(db, ownerName);

  return {
    app: buildApp({
      db,
      clock: fixedNowMs === undefined ? systemClock : { now: () => fixedNowMs },
    }),
    db,
  };
}
