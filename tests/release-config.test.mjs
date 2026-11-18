import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = new URL("..", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const readJson = (path) => JSON.parse(read(path));

function assertIncludesAll(text, fragments, label) {
  for (const fragment of fragments) {
    assert.ok(
      text.includes(fragment),
      `${label}: нет ${JSON.stringify(fragment)}`,
    );
  }
}

const bootstrapSha = "bef3dbc1d281d604106a922d5cf3cbb4cbcd860d";

test("release-please config has one root package and node release type", () => {
  const config = readJson("release-please-config.json");
  const manifest = readJson(".release-please-manifest.json");
  const packageJson = readJson("package.json");
  const changelog = read("CHANGELOG.md");

  assert.equal(config["bootstrap-sha"], bootstrapSha);
  assert.equal(config["release-type"], "node");
  assert.deepEqual(Object.keys(config.packages), ["."]);

  const pkg = config.packages["."];
  assert.equal(pkg["package-name"], packageJson.name);
  assert.equal(pkg["changelog-path"], "CHANGELOG.md");
  assert.equal(pkg["include-component-in-tag"], false);
  assert.equal(pkg["include-v-in-tag"], true);
  assert.equal(pkg["bump-minor-pre-major"], true);
  assert.equal(pkg.draft, false);
  assert.ok(!("bootstrap-sha" in pkg));

  assert.deepEqual(manifest, { ".": "0.0.0" });
  assert.equal(packageJson.version, "0.0.0");
  assert.match(changelog, /^# Changelog/m);

  assert.deepEqual(
    config["changelog-sections"]
      .filter((section) => !section.hidden)
      .map((section) => section.type),
    ["feat", "fix", "docs"],
  );
});

test("first release is v0.1.0 after S06", () => {
  const docs = read("docs/release-process.md");
  const config = readJson("release-please-config.json");

  assert.equal(config["bootstrap-sha"], bootstrapSha);
  assertIncludesAll(
    docs,
    [bootstrapSha, "S06", "v0.1.0", "0.0.0"],
    "docs/release-process.md",
  );
});

test("bootstrap sha is the parent of the S06 commit when history is available", (t) => {
  let parent;
  try {
    parent = execFileSync("git", ["rev-parse", "9aad539^"], {
      cwd: fileURLToPath(root),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    t.skip("S06 commit is not available in this checkout");
    return;
  }

  assert.equal(readJson("release-please-config.json")["bootstrap-sha"], parent);
});

test("release workflow uses dedicated token and explicit permissions", () => {
  const workflow = read(".github/workflows/release-please.yml");

  assertIncludesAll(
    workflow,
    [
      "name: release-please",
      "branches: [main]",
      "permissions:",
      "contents: write",
      "pull-requests: write",
      "googleapis/release-please-action@v4",
      "${{ secrets.RELEASE_PLEASE_TOKEN }}",
      "config-file: release-please-config.json",
      "manifest-file: .release-please-manifest.json",
    ],
    "release-please.yml",
  );
  assert.ok(!workflow.includes("GITHUB_TOKEN"));
});

test("PR title workflow enforces Conventional Commits", () => {
  const workflow = read(".github/workflows/pr-title.yml");

  assertIncludesAll(
    workflow,
    [
      "pull_request_target",
      "types: [opened, edited, synchronize, reopened]",
      "permissions:",
      "pull-requests: read",
      "name: pr-title",
      "amannn/action-semantic-pull-request@v5",
      "requireScope: false",
    ],
    "pr-title.yml",
  );

  for (const type of [
    "feat",
    "fix",
    "chore",
    "docs",
    "test",
    "refactor",
    "ci",
    "perf",
    "build",
    "style",
    "revert",
  ]) {
    assert.match(
      workflow,
      new RegExp(`^\\s+${type}$`, "m"),
      `pr-title.yml: нет типа ${type}`,
    );
  }
});

test("release PR runs check and e2e without bypasses or publishing", () => {
  const ci = read(".github/workflows/ci.yml");
  const workflows = [
    "ci.yml",
    "release-please.yml",
    "pr-title.yml",
    "nightly.yml",
    "hexlet-check.yml",
  ]
    .map((name) => read(`.github/workflows/${name}`))
    .join("\n");

  assertIncludesAll(ci, ["mise run check", "mise run e2e"], "ci.yml");
  assert.ok(!workflows.includes("[skip ci]"));
  assert.ok(!workflows.includes("paths-ignore"));
  assert.ok(!workflows.includes("auto-merge"));

  const lowered = workflows.toLowerCase();
  for (const forbidden of ["npm publish", "docker", "deploy"]) {
    assert.ok(!lowered.includes(forbidden), `workflows: найдено ${forbidden}`);
  }

  assertIncludesAll(
    read(".github/workflows/hexlet-check.yml"),
    ["DO NOT DELETE OR EDIT THIS FILE", "hexlet/project-action@release"],
    "hexlet-check.yml",
  );
});

test("docs cover branch protection, squash, manual merge and token rotation", () => {
  const docs = read("docs/release-process.md");
  const readme = read("README.md");
  const agents = read("AGENTS.md");

  assertIncludesAll(
    docs,
    [
      "RELEASE_PLEASE_TOKEN",
      "contents: write",
      "pull-requests: write",
      "ротируется",
      "squash",
      "pr-title",
      "main",
      "auto-merge",
      "[skip ci]",
      "paths-ignore",
      "Docker",
      "hexlet-check.yml",
    ],
    "docs/release-process.md",
  );

  assert.ok(readme.includes("docs/release-process.md"));
  assertIncludesAll(
    agents,
    ["`test: ...`", "`refactor: ...`", "`ci: ...`", "squash"],
    "AGENTS.md",
  );
});
