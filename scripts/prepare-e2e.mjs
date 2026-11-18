import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const portsPath = join(".e2e", "ports.json");
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
