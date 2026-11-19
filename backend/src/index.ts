import { createReadStream, mkdirSync, statSync } from "node:fs";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyReply } from "fastify";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { ensureOwner, openDatabase, runMigrations } from "./db/index.js";
import { systemClock } from "./domain/availability.js";

const config = loadConfig();

if (config.databasePath !== ":memory:") {
  mkdirSync(dirname(config.databasePath), { recursive: true });
}

const db = openDatabase(config.databasePath);
runMigrations(db);
ensureOwner(db, config.ownerName);

const { fixedNowMs } = config;
const clock =
  fixedNowMs === undefined ? systemClock : { now: () => fixedNowMs };

const app = buildApp({ db, clock });

app.addHook("onClose", async () => {
  db.close();
});

const frontendRoot = resolve(
  fileURLToPath(new URL("../../frontend/dist", import.meta.url)),
);

const mimeTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function sendFile(reply: FastifyReply, path: string) {
  return reply
    .type(mimeTypes[extname(path)] ?? "application/octet-stream")
    .send(createReadStream(path));
}

function notFound(reply: FastifyReply) {
  return reply.code(404).send({ code: "not_found", message: "Not found" });
}

app.setNotFoundHandler((req, reply) => {
  let pathname: string;
  try {
    pathname = decodeURIComponent(req.url.split("?")[0] || "/");
  } catch {
    return notFound(reply);
  }

  if (
    (req.method !== "GET" && req.method !== "HEAD") ||
    pathname === "/api" ||
    pathname.startsWith("/api/")
  ) {
    return notFound(reply);
  }

  const candidate = resolve(frontendRoot, `.${pathname}`);
  if (
    candidate !== frontendRoot &&
    !candidate.startsWith(`${frontendRoot}${sep}`)
  ) {
    return notFound(reply);
  }
  if (isFile(candidate)) return sendFile(reply, candidate);
  if (extname(pathname) === "") {
    const indexFile = join(frontendRoot, "index.html");
    if (isFile(indexFile)) return sendFile(reply, indexFile);
  }
  return notFound(reply);
});

const port = Number(process.env.PORT ?? 3000);

app.listen({ port, host: "0.0.0.0" }, (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Backend running on http://localhost:${port}`);
});
