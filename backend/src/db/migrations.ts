export type Migration = {
  version: number;
  name: string;
  sql: string;
};

export const migrations: Migration[] = [
  {
    version: 1,
    name: "create_owner_and_meeting_types",
    sql: `
      CREATE TABLE owner (
        id           INTEGER PRIMARY KEY CHECK (id = 1),
        display_name TEXT NOT NULL CHECK (length(trim(display_name)) > 0)
      );

      CREATE TABLE meeting_types (
        id           INTEGER PRIMARY KEY,
        name         TEXT NOT NULL CHECK (length(trim(name)) > 0),
        description  TEXT NOT NULL DEFAULT '',
        duration_min INTEGER NOT NULL CHECK (duration_min > 0 AND duration_min <= 540)
      );
    `,
  },
  {
    version: 2,
    name: "add_archived_at_to_meeting_types",
    sql: `
      ALTER TABLE meeting_types ADD COLUMN archived_at_ms INTEGER NULL;
    `,
  },
  {
    version: 3,
    name: "create_bookings",
    sql: `
      CREATE TABLE bookings (
        id              INTEGER PRIMARY KEY,
        meeting_type_id INTEGER NOT NULL REFERENCES meeting_types(id) ON DELETE RESTRICT,
        start_ms        INTEGER NOT NULL,
        end_ms          INTEGER NOT NULL,
        guest_name      TEXT NOT NULL CHECK (length(trim(guest_name)) > 0),
        guest_email     TEXT NOT NULL CHECK (length(trim(guest_email)) > 0),
        comment         TEXT,
        created_at_ms   INTEGER NOT NULL,
        CHECK (end_ms > start_ms)
      );

      CREATE INDEX idx_bookings_start_end ON bookings (start_ms, end_ms);
      CREATE INDEX idx_bookings_meeting_type ON bookings (meeting_type_id);

      CREATE TRIGGER bookings_no_overlap_insert
      BEFORE INSERT ON bookings
      FOR EACH ROW
      WHEN EXISTS (
        SELECT 1 FROM bookings b
        WHERE b.start_ms < NEW.end_ms AND b.end_ms > NEW.start_ms
      )
      BEGIN
        SELECT RAISE(ABORT, 'booking_overlap');
      END;

      CREATE TRIGGER bookings_no_overlap_update
      BEFORE UPDATE OF start_ms, end_ms ON bookings
      FOR EACH ROW
      WHEN EXISTS (
        SELECT 1 FROM bookings b
        WHERE b.id <> NEW.id
          AND b.start_ms < NEW.end_ms
          AND b.end_ms > NEW.start_ms
      )
      BEGIN
        SELECT RAISE(ABORT, 'booking_overlap');
      END;
    `,
  },
];
