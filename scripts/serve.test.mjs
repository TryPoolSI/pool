import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appServer } from "./serve.mjs";
test("web shell supports direct app routes without leaking data or masking missing assets", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pool-http-"));
  await writeFile(join(directory, "index.html"), '<div id="root"></div>');
  await mkdir(join(directory, "assets"));
  await writeFile(
    join(directory, "assets", "bundle.js"),
    'console.log("Pool")',
  );
  const server = appServer({ directory });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const route of [
      "/",
      "/app",
      "/app/rides/123",
      "/auth/confirm?token_hash=private",
    ]) {
      const response = await fetch(origin + route);
      assert.equal(response.status, 200);
      assert.match(response.headers.get("cache-control"), /private.*no-store/);
      assert.equal(await response.text(), '<div id="root"></div>');
    }
    for (const route of [
      "/assets/missing.js",
      "/_expo/missing.js",
      "/missing.css",
    ])
      assert.equal((await fetch(origin + route)).status, 404);
    const health = await fetch(origin + "/api/health");
    assert.deepEqual(await health.json(), { status: "ok" });
    assert.match(health.headers.get("cache-control"), /no-store/);
    const asset = await fetch(origin + "/assets/bundle.js");
    assert.match(asset.headers.get("cache-control"), /immutable/);
    assert.equal(
      (await fetch(origin + "/app", { method: "POST" })).status,
      405,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true });
  }
});
