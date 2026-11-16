import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { ensureOwner, openDatabase, runMigrations } from "./db/index.js";

const config = loadConfig();

if (config.databasePath !== ":memory:") {
  mkdirSync(dirname(config.databasePath), { recursive: true });
}

const db = openDatabase(config.databasePath);
runMigrations(db);
ensureOwner(db, config.ownerName);

const app = buildApp({ db });

app.addHook("onClose", async () => {
  db.close();
});

const port = Number(process.env.PORT ?? 3000);

app.listen({ port, host: "0.0.0.0" }, (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Backend running on http://localhost:${port}`);
});
