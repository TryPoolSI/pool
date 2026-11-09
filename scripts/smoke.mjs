import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

export async function smoke(
  base,
  { request = fetch, bypass = "", attempts = 30 } = {},
) {
  const origin = new URL(base).origin;
  async function get(path, contentType) {
    const url = new URL(path, origin);
    assert.equal(
      url.origin,
      origin,
      "Smoke requests must stay on the deployment origin",
    );
    const response = await request(url, {
      redirect: "manual",
      headers: bypass ? { "x-vercel-protection-bypass": bypass } : {},
      signal: AbortSignal.timeout(10_000),
    });
    assert.equal(response.status, 200, `${url.pathname}: expected HTTP 200`);
    assert.match(response.headers.get("content-type") || "", contentType);
    return { response, body: await response.text() };
  }

  // Retry startup only. A bad page/asset must fail rather than become a false pass.
  let healthy = false;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const { response, body } = await get("/api/health", /application\/json/);
      assert.deepEqual(JSON.parse(body), { status: "ok" });
      assert.match(response.headers.get("cache-control") || "", /no-store/);
      healthy = true;
      break;
    } catch {
      if (attempt + 1 < attempts)
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  assert.ok(healthy, "Application liveness check failed");
  const { body: html } = await get("/", /text\/html/);
  assert.match(html, /<div[^>]+id="root"/);
  const scripts = [...html.matchAll(/<script\b[^>]*src="([^"]+)"/g)];
  assert.ok(scripts.length, "Expo shell must load its application bundle");
  for (const [, src] of scripts) await get(src, /javascript/);
  await get("/app/rides/00000000-0000-4000-8000-000000000001", /text\/html/);
  const styles = [...html.matchAll(/<link\b[^>]*>/g)]
    .filter(([tag]) => /\brel="stylesheet"/.test(tag))
    .map(([tag]) => tag.match(/\bhref="([^"]+)"/)?.[1]);
  assert.ok(styles.every(Boolean), "Stylesheet links must have valid paths");
  for (const href of styles) {
    const { body: css } = await get(href.replaceAll("&amp;", "&"), /text\/css/);
    assert.ok(css.length > 100 && css.includes("{"), "CSS must contain rules");
  }
  const { body: robots } = await get("/robots.txt", /text\/plain/);
  assert.match(robots, /User-agent:\s*\*/i);
  assert.match(robots, /^Disallow:\s*\/$/im);
  console.log(
    "Smoke: homepage, linked CSS, robots.txt and application liveness OK",
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await smoke(process.argv[2]);
}
