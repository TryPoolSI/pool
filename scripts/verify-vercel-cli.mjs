import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { deploymentArguments } from "./deliver.mjs";

// Validate the installed, pinned package rather than upstream's moving command
// definition. This step has no credentials and invokes help, never deployment.
const cli = resolve(process.argv[2]);
assert.equal(
  JSON.parse(readFileSync(join(dirname(cli), "../package.json"), "utf8"))
    .version,
  "65.4.0",
);
const { deployCommand } = await import(
  pathToFileURL(join(dirname(cli), "chunks/chunk-O4WNSKQR.js")).href
);
const options = new Map(
  deployCommand.options.map((option) => [`--${option.name}`, option]),
);
const control = mkdtempSync(join(tmpdir(), "pool-cli-check-"));
try {
  for (const target of ["preview", "production"]) {
    const args = deploymentArguments(target, "a".repeat(40), "prj_fixture", {
      EXPO_PUBLIC_SUPABASE_URL: "https://ci-placeholder.invalid",
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_ci_placeholder",
      PORT: "3000",
    });
    for (const flag of args.filter((arg) => arg.startsWith("--"))) {
      assert.ok(
        options.has(flag) && !options.get(flag).deprecated,
        `Unsupported/deprecated deploy flag: ${flag}`,
      );
    }
    const result = spawnSync(
      process.execPath,
      [cli, ...args, "--help", "--global-config", control],
      {
        env: {
          PATH: process.env.PATH,
          CI: "1",
          VERCEL_TELEMETRY_DISABLED: "1",
        },
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 30_000,
      },
    );
    assert.equal(result.status, 0, "Pinned CLI help invocation failed");
    const output = `${result.stdout}${result.stderr}`;
    assert.match(output, /vercel deploy/);
    assert.match(output, /--environment/);
  }
  console.log(
    "Pinned Vercel CLI: preview/production argument definitions and help invocations passed (no deployment)",
  );
} finally {
  rmSync(control, { recursive: true, force: true });
}
