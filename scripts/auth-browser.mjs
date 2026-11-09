import { execFileSync, spawn } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  cpSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:net";
import assert from "node:assert/strict";
import {
  permissionTests,
  baselineIdentity,
} from "./membership-permissions.mjs";
import {
  ridePermissionTests,
  rideUpgradeIdentity,
} from "./ride-permissions.mjs";
import {
  driverPermissionTests,
  driverUpgradeIdentity,
} from "./driver-permissions.mjs";
import {
  handoffPermissionTests,
  handoffUpgradeIdentity,
} from "./handoff-permissions.mjs";
import {
  replacementPermissionTests,
  replacementUpgradeIdentity,
  replacementCompletedUpgradeIdentity,
} from "./replacement-permissions.mjs";
import { migrationDatabaseTests } from "./migration-database-tests.mjs";

// No external URL/key options: this command can only use the fresh CLI project
// it owns, on ports distinct from the developer's existing pool backend.
const directory = mkdtempSync(join(tmpdir(), "pool-auth-test-"));
const project = `pool-auth-test-${process.pid}`;
const cli = resolve("node_modules/.bin/supabase");
const network = `${project}-network`;
const args = ["--workdir", directory, "--network-id", network];
// Keep CLI branch discovery inside the disposable project too. --workdir alone
// does not prevent reset from discovering the calling checkout's Git branch.
function disposableSupabase(commandArgs, options = {}) {
  return execFileSync(cli, commandArgs, { ...options, cwd: directory });
}
mkdirSync(join(directory, "supabase"), { recursive: true });
mkdirSync(join(directory, "auth/email"), { recursive: true });
for (const template of ["confirmation", "recovery"])
  copyFileSync(
    `auth/email/${template}.html`,
    join(directory, `auth/email/${template}.html`),
  );
// A native flow starts a separate UI driver for each stage; keep captured mail
// valid across those launches. Browser expiry journeys retain their short TTL.
let config = readFileSync("supabase/config.toml", "utf8")
  .replace('project_id = "pool"', `project_id = "${project}"`)
  .replaceAll("543", "553")
  .replace(
    'site_url = "http://localhost:3000"',
    'site_url = "http://localhost:3100"\njwt_expiry = 120',
  )
  .replace(
    'additional_redirect_urls = ["http://localhost:3001"]',
    'additional_redirect_urls = ["http://localhost:3100/auth/callback"]',
  )
  .replace("[realtime]\nenabled = true", "[realtime]\nenabled = false")
  .replace("[studio]\nenabled = true", "[studio]\nenabled = false")
  .replace(
    "[auth.email]\n",
    `[auth.email]\nmax_frequency = "1s"\notp_expiry = ${process.argv.includes("--ios") ? 300 : 10}\n`,
  );
config += `
[auth.rate_limit]
email_sent = 1000
token_refresh = 1000
sign_in_sign_ups = 1000
token_verifications = 1000
`;
writeFileSync(join(directory, "supabase/config.toml"), config);

let activeChild;
let appServer;
let backendAttempted = false;
let cleanupStarted = false;
function cleanup() {
  if (cleanupStarted) return;
  cleanupStarted = true;
  activeChild?.kill("SIGINT");
  appServer?.kill("SIGTERM");
  let stopped = !backendAttempted;
  try {
    if (backendAttempted)
      disposableSupabase(["stop", "--no-backup", ...args], {
        stdio: "ignore",
        timeout: 60_000,
      });
    stopped = true;
  } catch {
    console.error(
      `Disposable Auth cleanup failed; retain ${directory} and stop project ${project} on network ${network}.`,
    );
    process.exitCode = 1;
  }
  try {
    execFileSync("docker", ["network", "rm", network], { stdio: "ignore" });
  } catch {
    /* CLI may have removed it. */
  }
  if (stopped) rmSync(directory, { recursive: true, force: true });
}
process.on("SIGINT", () => {
  cleanup();
  process.exit(130);
});
process.on("SIGTERM", () => {
  cleanup();
  process.exit(143);
});
async function run(command, commandArgs, env) {
  await new Promise((resolveRun, reject) => {
    activeChild = spawn(command, commandArgs, { env, stdio: "inherit" });
    activeChild.on("error", reject);
    activeChild.on("exit", (code) =>
      code === 0
        ? resolveRun()
        : reject(new Error(`Auth validation command failed (${code})`)),
    );
  });
  activeChild = undefined;
}
try {
  await new Promise((resolvePort, reject) => {
    const probe = createServer();
    probe.once("error", () =>
      reject(new Error("Auth test app port 3100 is already in use")),
    );
    probe.listen(3100, "127.0.0.1", () => probe.close(resolvePort));
  });
  console.log(
    `Starting disposable Auth project ${project} in ${directory} on network ${network} (55320–55329). Existing pool data is untouched.`,
  );
  execFileSync(
    "docker",
    [
      "network",
      "create",
      "--driver",
      "bridge",
      "--opt",
      "com.docker.network.bridge.host_binding_ipv4=127.0.0.1",
      network,
    ],
    { stdio: "ignore" },
  );
  // Suppress CLI stdout because it prints admin credentials we neither use nor log.
  backendAttempted = true;
  disposableSupabase(["start", ...args], {
    stdio: ["ignore", "ignore", "inherit"],
    timeout: 600_000,
  });
  const status = JSON.parse(
    disposableSupabase(["status", "--output", "json", ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }),
  );
  if (new URL(status.API_URL).origin !== "http://127.0.0.1:55321")
    throw new Error("Unexpected disposable API URL");
  // Start at the R2 baseline, preserve an existing Auth identity through upgrade,
  // then rebuild clean and require identical generated public types.
  const baseline = await baselineIdentity(status);
  mkdirSync(join(directory, "supabase/migrations"), { recursive: true });
  copyFileSync(
    "supabase/migrations/20261027000100_membership.sql",
    join(directory, "supabase/migrations/20261027000100_membership.sql"),
  );
  disposableSupabase(["db", "push", "--local", ...args], {
    stdio: ["ignore", "ignore", "inherit"],
  });
  await baseline();
  const verifyR3 = await rideUpgradeIdentity(status);
  copyFileSync(
    "supabase/migrations/20261027000200_ride_planning.sql",
    join(directory, "supabase/migrations/20261027000200_ride_planning.sql"),
  );
  disposableSupabase(["db", "push", "--local", ...args], {
    stdio: ["ignore", "ignore", "inherit"],
  });
  await verifyR3();
  const verifyR4 = await driverUpgradeIdentity(status);
  copyFileSync(
    "supabase/migrations/20261027000300_driver_confirmation.sql",
    join(
      directory,
      "supabase/migrations/20261027000300_driver_confirmation.sql",
    ),
  );
  disposableSupabase(["db", "push", "--local", ...args], {
    stdio: ["ignore", "ignore", "inherit"],
  });
  await verifyR4();
  const verifyR5 = await handoffUpgradeIdentity(status);
  copyFileSync(
    "supabase/migrations/20261027000400_ride_handoffs.sql",
    join(directory, "supabase/migrations/20261027000400_ride_handoffs.sql"),
  );
  disposableSupabase(["db", "push", "--local", ...args], {
    stdio: ["ignore", "ignore", "inherit"],
  });
  const verifyR6 = await verifyR5();
  copyFileSync(
    "supabase/migrations/20261027000500_handoff_request_bindings.sql",
    join(
      directory,
      "supabase/migrations/20261027000500_handoff_request_bindings.sql",
    ),
  );
  disposableSupabase(["db", "push", "--local", ...args], {
    stdio: ["ignore", "ignore", "inherit"],
  });
  await verifyR6();
  const verifyR7 = await replacementUpgradeIdentity(status);
  copyFileSync(
    "supabase/migrations/20261027000600_driver_replacements.sql",
    join(
      directory,
      "supabase/migrations/20261027000600_driver_replacements.sql",
    ),
  );
  disposableSupabase(["db", "push", "--local", ...args], {
    stdio: ["ignore", "ignore", "inherit"],
  });
  await verifyR7();
  const verifyCompletedR7 = await replacementCompletedUpgradeIdentity(status);
  cpSync("supabase/migrations", join(directory, "supabase/migrations"), {
    recursive: true,
  });
  disposableSupabase(["db", "push", "--local", ...args], {
    stdio: ["ignore", "ignore", "inherit"],
  });
  await verifyCompletedR7();
  await verifyR7();
  await verifyR6();
  function generatedTypes() {
    const database = new URL(status.DB_URL);
    assert.equal(database.hostname, "127.0.0.1");
    assert.equal(database.port, "55322");
    try {
      return disposableSupabase(
        [
          "gen",
          "types",
          "--lang",
          "typescript",
          "--db-url",
          status.DB_URL,
          "--schema",
          "public",
          "--workdir",
          directory,
        ],
        {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
          maxBuffer: 2 * 1024 * 1024,
        },
      ).replace(/[\t ]+$/gm, "");
    } catch {
      throw new Error(
        "Local type generation failed (connection output suppressed)",
      );
    }
  }
  const upgradedTypes = generatedTypes();
  const focusedBrowser = process.argv.includes("--membership-only");
  if (!focusedBrowser)
    disposableSupabase(["db", "reset", "--local", "--no-seed", ...args], {
      stdio: ["ignore", "ignore", "inherit"],
    });
  const cleanTypes = focusedBrowser ? upgradedTypes : generatedTypes();
  assert.equal(
    cleanTypes,
    upgradedTypes,
    "Clean and R2/R3/R4/R5/R6 upgrade schemas differ",
  );
  if (process.argv.includes("--write-types"))
    writeFileSync("src/lib/supabase/database.types.ts", cleanTypes);
  else
    assert.equal(
      cleanTypes,
      readFileSync("src/lib/supabase/database.types.ts", "utf8"),
      "Generated database types drifted; run npm run db:types",
    );
  let backendReady = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(`${status.API_URL}/auth/v1/health`, {
        headers: { apikey: status.PUBLISHABLE_KEY || status.ANON_KEY },
        signal: AbortSignal.timeout(1000),
      });
      backendReady = response.ok;
    } catch {
      /* CLI reset restarts the gateway and Auth. */
    }
    if (backendReady) break;
    await new Promise((ready) => setTimeout(ready, 500));
  }
  assert.ok(
    backendReady,
    "Disposable backend did not recover after clean reset",
  );
  const sql = (statement) =>
    execFileSync(
      "docker",
      [
        "exec",
        "-i",
        `supabase_db_${project}`,
        "psql",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-v",
        "ON_ERROR_STOP=1",
        "-At",
      ],
      {
        input: statement,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      },
    ).trim();
  await permissionTests(status, sql);
  await ridePermissionTests(status, sql);
  await driverPermissionTests(status, sql);
  await handoffPermissionTests(status, sql);
  await replacementPermissionTests(status, sql);
  await migrationDatabaseTests(status, sql);
  console.log(
    `${focusedBrowser ? "R2 upgrade" : "Clean migrations and R2/R3/R4/R5/R6 upgrade"}, generated types and real-session permissions passed.`,
  );
  if (
    process.argv.includes("--database-only") ||
    process.argv.includes("--write-types")
  ) {
    cleanup();
    process.exit(process.exitCode || 0);
  }
  const env = {
    ...process.env,
    NODE_ENV: "production",
    EXPO_NO_TELEMETRY: "1",
    EXPO_NO_DOTENV: "1",
    EXPO_PUBLIC_SUPABASE_URL: "http://localhost:55321",
    EXPO_PUBLIC_WEB_ORIGIN: "http://localhost:3100",
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      status.PUBLISHABLE_KEY || status.ANON_KEY,
    SUPABASE_INTERNAL_URL: "",
    SUPABASE_SERVICE_ROLE_KEY: "",
    SUPABASE_SECRET_KEY: "",
    AUTH_TEST_DISPOSABLE: "1",
    AUTH_TEST_OUTPUT_DIR: join(directory, "browser-results"),
    PORT: "3100",
    HOSTNAME: "127.0.0.1",
  };
  if (!env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
    throw new Error("Disposable public key missing");
  await run(
    process.execPath,
    ["node_modules/expo/bin/cli", "export", "--platform", "web"],
    env,
  );
  appServer = spawn(process.execPath, ["scripts/serve.mjs"], {
    env,
    stdio: "inherit",
  });
  let startupError;
  appServer.on("error", (error) => {
    startupError = error;
  });
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (startupError || appServer.exitCode !== null)
      throw new Error("Auth test app failed to start");
    try {
      const response = await fetch("http://127.0.0.1:3100/api/health", {
        signal: AbortSignal.timeout(1000),
      });
      ready = response.ok;
    } catch {
      /* Server startup. */
    }
    if (ready) break;
    await new Promise((resolveReady) => setTimeout(resolveReady, 500));
  }
  if (!ready) throw new Error("Auth test app did not become ready");
  {
    const native = process.argv.includes("--ios");
    const watch = process.argv.includes(
      native ? "--watch-ios" : "--watch-browser",
    );
    let reuseNativeProject = process.argv.includes("--reuse-project");
    do {
      try {
        if (native)
          await run(
            process.execPath,
            [
              "scripts/ios-test.mjs",
              "--from-harness",
              ...(reuseNativeProject ? ["--reuse-project"] : []),
            ],
            env,
          );
        else
          await run(
            process.execPath,
            [
              "node_modules/@playwright/test/cli.js",
              "test",
              ...(process.argv.includes("--membership-only")
                ? ["tests/auth/membership.spec.mjs"]
                : process.argv.includes("--rides-only")
                  ? ["tests/auth/rides.spec.mjs"]
                  : process.argv.includes("--drivers-only")
                    ? ["tests/auth/drivers.spec.mjs"]
                    : process.argv.includes("--replacements-only")
                      ? ["tests/auth/replacements.spec.mjs"]
                      : process.argv.includes("--handoffs-only")
                        ? ["tests/auth/handoffs.spec.mjs"]
                        : process.argv.includes("--presentation-only")
                          ? ["tests/auth/presentation.spec.mjs"]
                          : process.argv.includes("--session-only")
                            ? ["tests/auth/session.spec.mjs"]
                            : []),
            ],
            env,
          );
      } catch (error) {
        if (!watch) throw error;
        console.error(error.message);
      }
      if (!watch) break;
      // Test/source iterations still run xcodebuild and bundle current JS.
      // Restart the watcher after dependency or Expo native-config changes.
      reuseNativeProject = native;
      const { createInterface } = await import("node:readline/promises");
      const input = createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      const answer = await input.question(
        "Disposable backend retained. Enter r to rebuild/retest or q to clean up: ",
      );
      input.close();
      if (answer.trim() !== "r") break;
      await run(
        process.execPath,
        ["node_modules/expo/bin/cli", "export", "--platform", "web"],
        env,
      );
    } while (watch);
  }
} catch (error) {
  console.error(error.code === "ERR_ASSERTION" ? error.stack : error.message);
  process.exitCode = 1;
} finally {
  cleanup();
}
