import Database from "better-sqlite3";
import { migrations } from "./migrations.js";

export type Db = Database.Database;

export function openDatabase(path: string): Db {
  const db = new Database(path, { timeout: 5000 });

  if (path !== ":memory:") {
    db.pragma("journal_mode = WAL");
  }

  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");

  return db;
}

export function runMigrations(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version       INTEGER PRIMARY KEY,
      name          TEXT NOT NULL,
      applied_at_ms INTEGER NOT NULL
    );
  `);

  const appliedRows = db
    .prepare("SELECT version FROM schema_migrations")
    .all() as Array<{ version: number }>;
  const applied = new Set(appliedRows.map((row) => row.version));
  const recordMigration = db.prepare(
    "INSERT INTO schema_migrations (version, name, applied_at_ms) VALUES (?, ?, ?)",
  );

  for (const migration of migrations) {
    if (applied.has(migration.version)) {
      continue;
    }

    const apply = db.transaction(() => {
      db.exec(migration.sql);
      recordMigration.run(migration.version, migration.name, Date.now());
    });

    apply.immediate();
  }
}

export function ensureOwner(db: Db, displayName: string): void {
  db.prepare(
    "INSERT OR IGNORE INTO owner (id, display_name) VALUES (1, ?)",
  ).run(displayName);
}
