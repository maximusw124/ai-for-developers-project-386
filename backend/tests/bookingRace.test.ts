import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { ensureOwner, openDatabase, runMigrations } from "../src/db/index.js";

const NOW = Date.parse("2026-11-16T05:00:00.000Z");
const START_MS = Date.parse("2026-11-16T06:00:00.000Z");
const END_MS = START_MS + 30 * 60_000;
const TEST_DATA_DIR = fileURLToPath(new URL("../data/", import.meta.url));

const workerSource = `
  const Database = require("better-sqlite3");
  const { parentPort, workerData } = require("node:worker_threads");
  const gate = new Int32Array(workerData.gate);
  Atomics.wait(gate, 0, 0, 5000);
  const db = new Database(workerData.databasePath, { timeout: 50 });
  db.pragma("busy_timeout = 50");
  let outcome;
  try {
    const insert = db.transaction(() => {
      const overlap = db
        .prepare("SELECT id FROM bookings WHERE start_ms < ? AND end_ms > ? LIMIT 1")
        .get(workerData.endMs, workerData.startMs);
      if (overlap) return "taken";
      db.prepare(
        "INSERT INTO bookings (meeting_type_id, start_ms, end_ms, guest_name, guest_email, comment, created_at_ms) VALUES (?, ?, ?, 'Worker', 'worker@example.com', NULL, ?)"
      ).run(workerData.meetingTypeId, workerData.startMs, workerData.endMs, workerData.nowMs);
      return "created";
    });
    outcome = insert.immediate();
  } catch (error) {
    outcome =
      typeof error.code === "string" && error.code.startsWith("SQLITE_BUSY")
        ? "busy"
        : "error";
  }
  db.close();
  parentPort.postMessage(outcome);
`;

function setup() {
  mkdirSync(TEST_DATA_DIR, { recursive: true });
  const directory = mkdtempSync(join(TEST_DATA_DIR, "race-"));
  const databasePath = join(directory, "booking.db");
  const db = openDatabase(databasePath);
  runMigrations(db);
  ensureOwner(db, "Владелец");
  db.pragma("busy_timeout = 20");
  const meetingTypeId = Number(
    db
      .prepare(
        "INSERT INTO meeting_types (name, description, duration_min, archived_at_ms) VALUES ('Short', '', 30, NULL)",
      )
      .run().lastInsertRowid,
  );
  const app = buildApp({ db, clock: { now: () => NOW } });

  return {
    app,
    db,
    databasePath,
    meetingTypeId,
    async close() {
      await app.close();
      db.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

function payload(meetingTypeId: number) {
  return {
    meetingTypeId,
    start: new Date(START_MS).toISOString(),
    guestName: "Гость",
    guestEmail: "guest@example.com",
  };
}

describe("Booking concurrency", () => {
  const contexts: Array<ReturnType<typeof setup>> = [];

  afterEach(async () => {
    for (const context of contexts.splice(0)) await context.close();
  });

  function track() {
    const context = setup();
    contexts.push(context);
    return context;
  }

  it("returns service_busy when another SQLite connection holds the write lock", async () => {
    const { app, db, databasePath, meetingTypeId } = track();
    const blocker = openDatabase(databasePath);
    blocker.pragma("busy_timeout = 20");
    blocker.exec("BEGIN IMMEDIATE");

    const busy = await app.inject({
      method: "POST",
      url: "/api/bookings",
      payload: payload(meetingTypeId),
    });
    expect(busy.statusCode).toBe(503);
    expect(busy.json().code).toBe("service_busy");

    blocker.exec("ROLLBACK");
    blocker.close();

    const retry = await app.inject({
      method: "POST",
      url: "/api/bookings",
      payload: payload(meetingTypeId),
    });
    expect(retry.statusCode).toBe(201);
    expect(db.prepare("SELECT COUNT(*) AS count FROM bookings").get()).toEqual({
      count: 1,
    });
  });

  it("allows only one of two racing connections to book the slot", async () => {
    const { app, db, databasePath, meetingTypeId } = track();
    const gate = new Int32Array(new SharedArrayBuffer(4));
    const worker = new Worker(workerSource, {
      eval: true,
      workerData: {
        databasePath,
        gate: gate.buffer,
        meetingTypeId,
        startMs: START_MS,
        endMs: END_MS,
        nowMs: NOW,
      },
    });
    const workerOutcome = new Promise<string>((resolve, reject) => {
      worker.once("message", resolve);
      worker.once("error", reject);
    });

    Atomics.store(gate, 0, 1);
    Atomics.notify(gate, 0);

    const response = await app.inject({
      method: "POST",
      url: "/api/bookings",
      payload: payload(meetingTypeId),
    });
    const outcome = await workerOutcome;
    await worker.terminate();

    expect([201, 409, 503]).toContain(response.statusCode);
    expect(["created", "taken", "busy"]).toContain(outcome);
    expect(
      Number(response.statusCode === 201) + Number(outcome === "created"),
    ).toBe(1);
    expect(db.prepare("SELECT COUNT(*) AS count FROM bookings").get()).toEqual({
      count: 1,
    });
  });
});
