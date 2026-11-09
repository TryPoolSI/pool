import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const checkScript = fileURLToPath(
  new URL("./check-supabase.mjs", import.meta.url),
);
const publicKey = "sb_publishable_test_fixture";
const adminKey = "sb_secret_test_fixture";

async function runCheck(environment, args = []) {
  try {
    const result = await execFileAsync(
      process.execPath,
      [checkScript, ...args],
      {
        env: {
          ...process.env,
          EXPO_PUBLIC_SUPABASE_URL: "",
          EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
          SUPABASE_INTERNAL_URL: "",
          SUPABASE_SERVICE_ROLE_KEY: "",
          SUPABASE_SECRET_KEY: "",
          ...environment,
        },
        timeout: 5_000,
      },
    );
    return { code: 0, ...result };
  } catch (error) {
    if (typeof error.code !== "number") throw error;
    return { code: error.code, stdout: error.stdout, stderr: error.stderr };
  }
}

async function startAuthServer(context, settingsStatus = 200) {
  const requests = [];
  const server = createServer((request, response) => {
    requests.push({ path: request.url, key: request.headers.apikey });
    const knownEndpoint = ["/auth/v1/health", "/auth/v1/settings"].includes(
      request.url,
    );
    let status = 200;
    if (!knownEndpoint) {
      status = 404;
    } else if (request.headers.apikey !== publicKey) {
      status = 401;
    } else if (request.url === "/auth/v1/settings") {
      status = settingsStatus;
    }
    response.writeHead(status, { "Content-Type": "application/json" });
    response.end(JSON.stringify(status === 200 ? {} : { message: adminKey }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(
    () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  );
  return { url: `http://127.0.0.1:${server.address().port}`, requests };
}

test("checks public Auth access even when admin keys are configured", async (context) => {
  const { url, requests } = await startAuthServer(context);
  const result = await runCheck({
    EXPO_PUBLIC_SUPABASE_URL: url,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publicKey,
    SUPABASE_SERVICE_ROLE_KEY: adminKey,
    SUPABASE_SECRET_KEY: adminKey,
    SUPABASE_INTERNAL_URL: "http://unused.invalid",
  });

  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(requests, [
    { path: "/auth/v1/health", key: publicKey },
    { path: "/auth/v1/settings", key: publicKey },
  ]);
  assert.match(
    result.stdout,
    /Database queries and row-level security are not checked/,
  );
  assert.ok(!`${result.stdout}${result.stderr}`.includes(adminKey));
});

test("requires a public key even when an admin key is available", async () => {
  const result = await runCheck({
    EXPO_PUBLIC_SUPABASE_URL: "http://unused.invalid",
    SUPABASE_SERVICE_ROLE_KEY: adminKey,
  });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  assert.equal(result.stdout, "");
});

test("requires a URL before making requests", async () => {
  const result = await runCheck({
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publicKey,
  });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Supabase URL/);
});

test("fails when Auth rejects the public key, without logging response bodies", async (context) => {
  const { url } = await startAuthServer(context);
  const result = await runCheck({
    EXPO_PUBLIC_SUPABASE_URL: url,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "invalid-public-key",
  });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /\/auth\/v1\/health returned HTTP 401/);
  assert.doesNotMatch(result.stdout, /connectivity verified/);
  assert.ok(!`${result.stdout}${result.stderr}`.includes(adminKey));
});

for (const settingsStatus of [401, 503]) {
  test(`fails on Auth settings HTTP ${settingsStatus} after a successful health check`, async (context) => {
    const { url } = await startAuthServer(context, settingsStatus);
    const result = await runCheck({
      EXPO_PUBLIC_SUPABASE_URL: url,
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publicKey,
    });

    assert.equal(result.code, 1);
    assert.match(result.stdout, /\/auth\/v1\/health: OK/);
    assert.ok(
      result.stderr.includes(
        `/auth/v1/settings returned HTTP ${settingsStatus}`,
      ),
    );
    assert.doesNotMatch(result.stdout, /connectivity verified/);
    assert.ok(!`${result.stdout}${result.stderr}`.includes(adminKey));
  });
}

test("uses the internal URL only when requested", async (context) => {
  const { url } = await startAuthServer(context);
  const result = await runCheck(
    {
      EXPO_PUBLIC_SUPABASE_URL: "http://unused.invalid",
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publicKey,
      SUPABASE_INTERNAL_URL: url,
    },
    ["--internal"],
  );

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Container Supabase/);
});

test("falls back to the public URL when no internal URL is configured", async (context) => {
  const { url } = await startAuthServer(context);
  const result = await runCheck(
    {
      EXPO_PUBLIC_SUPABASE_URL: url,
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publicKey,
    },
    ["--internal"],
  );

  assert.equal(result.code, 0, result.stderr);
});
