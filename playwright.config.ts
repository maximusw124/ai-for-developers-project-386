import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const portsPath = join(".e2e", "ports.json");

function loadPorts(): number[] {
  try {
    return JSON.parse(readFileSync(portsPath, "utf8")) as number[];
  } catch {
    const ports = execFileSync(
      process.execPath,
      [join("scripts", "allocate-e2e-ports.mjs"), "2"],
      { encoding: "utf8" },
    )
      .trim()
      .split(/\s+/)
      .map(Number);
    mkdirSync(dirname(portsPath), { recursive: true });
    writeFileSync(portsPath, JSON.stringify(ports));
    return ports;
  }
}

const [backendPort, frontendPort] = loadPorts();
const apiUrl = `http://127.0.0.1:${backendPort}`;
const webUrl = `http://127.0.0.1:${frontendPort}`;
const backendTz = process.env.E2E_TZ ?? "UTC";
const browserTimezone = process.env.E2E_TIMEZONE_ID ?? "America/New_York";

const databasePath = join(
  mkdtempSync(join(tmpdir(), "booking-e2e-")),
  "booking.db",
);

const allProjects = [
  { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  { name: "firefox", use: { ...devices["Desktop Firefox"] } },
  { name: "webkit", use: { ...devices["Desktop Safari"] } },
];
const selectedProjects = (process.env.E2E_PROJECTS ?? "chromium")
  .split(",")
  .map((name) => name.trim())
  .filter(Boolean);
const unknownProjects = selectedProjects.filter(
  (name) => !allProjects.some((project) => project.name === name),
);
if (unknownProjects.length > 0) {
  throw new Error(`Unknown E2E projects: ${unknownProjects.join(", ")}`);
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: webUrl,
    timezoneId: browserTimezone,
    trace: "retain-on-failure",
  },
  projects: allProjects.filter((project) =>
    selectedProjects.includes(project.name),
  ),
  webServer: [
    {
      command: "npm run start --workspace backend",
      url: `${apiUrl}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        DATABASE_PATH: databasePath,
        OWNER_NAME: "Владелец",
        PORT: String(backendPort),
        FIXED_NOW: "2026-11-16T05:00:00.000Z",
        TZ: backendTz,
      },
    },
    {
      command: `npm run dev --workspace frontend -- --host 127.0.0.1 --port ${frontendPort} --strictPort`,
      url: webUrl,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        API_PROXY_TARGET: apiUrl,
        TZ: backendTz,
      },
    },
  ],
});
