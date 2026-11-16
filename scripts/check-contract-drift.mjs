import { spawnSync } from "node:child_process";

const result = spawnSync(
  "git",
  ["diff", "--exit-code", "--", "contract/openapi"],
  { stdio: "inherit" },
);

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

if (result.status !== 0) {
  console.error(
    "OpenAPI drift detected: contract/openapi/openapi.yaml is out of date. " +
      "Run `npm run contract:compile` and commit the generated snapshot.",
  );
  process.exit(1);
}
