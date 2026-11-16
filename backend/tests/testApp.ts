import { buildApp } from "../src/app.js";
import { ensureOwner, openDatabase, runMigrations } from "../src/db/index.js";

export function createTestApp(ownerName = "Владелец") {
  const db = openDatabase(":memory:");
  runMigrations(db);
  ensureOwner(db, ownerName);

  return {
    app: buildApp({ db }),
    db,
  };
}
