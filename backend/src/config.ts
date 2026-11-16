import { fileURLToPath } from "node:url";

export type Config = {
  databasePath: string;
  ownerName: string;
};

const defaultDatabasePath = fileURLToPath(
  new URL("../data/booking.db", import.meta.url),
);

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const ownerName = env.OWNER_NAME?.trim();

  return {
    databasePath: env.DATABASE_PATH ?? defaultDatabasePath,
    ownerName: ownerName || "Владелец",
  };
}
