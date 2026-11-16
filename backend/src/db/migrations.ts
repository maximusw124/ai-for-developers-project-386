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
];
