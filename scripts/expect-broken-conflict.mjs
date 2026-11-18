import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const vitestCli = join(projectRoot, "node_modules", "vitest", "vitest.mjs");

const result = spawnSync(
  process.execPath,
  [vitestCli, "run", "tests/bookingConflict.test.ts"],
  {
    cwd: join(projectRoot, "backend"),
    env: { ...process.env, NODE_ENV: "test", TEST_BREAK_OVERLAP: "1" },
    stdio: "inherit",
  },
);

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

if (result.status === 0) {
  console.error(
    "Conflict spec passed with TEST_BREAK_OVERLAP=1: the test does not detect a broken overlap rule.",
  );
  process.exit(1);
}

console.log(
  "Conflict spec failed with TEST_BREAK_OVERLAP=1 as expected: overlap protection is verified.",
);
