import { fileURLToPath } from "node:url";

export type Config = {
  databasePath: string;
  ownerName: string;
  fixedNowMs?: number;
};

const defaultDatabasePath = fileURLToPath(
  new URL("../data/booking.db", import.meta.url),
);

function parseFixedNow(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const ms = Date.parse(raw);
  if (Number.isNaN(ms)) {
    throw new Error("FIXED_NOW must be an ISO 8601 timestamp");
  }
  return ms;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const ownerName = env.OWNER_NAME?.trim();

  return {
    databasePath: env.DATABASE_PATH ?? defaultDatabasePath,
    ownerName: ownerName || "Владелец",
    fixedNowMs: parseFixedNow(env.FIXED_NOW),
  };
}
