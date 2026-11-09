import assert from "node:assert/strict";
import test from "node:test";
import { smoke } from "./smoke.mjs";

test("smoke requires actual page, same-origin stylesheet, robots and uncached health", async () => {
  for (const failure of [
    null,
    "health",
    "cache",
    "page",
    "css",
    "redirect",
    "external-css",
    "robots",
  ]) {
    const seen = [];
    const request = async (url) => {
      seen.push(url.pathname);
      if (url.pathname === "/api/health")
        return Response.json(
          failure === "health" ? { status: "error" } : { status: "ok" },
          {
            headers: {
              "cache-control": failure === "cache" ? "public" : "no-store",
            },
          },
        );
      if (url.pathname === "/")
        return new Response(
          `<div id="${failure === "page" ? "login" : "root"}"></div><script src="/entry.js"></script>` +
            `<link href="${failure === "external-css" ? "https://other.example" : ""}/style.css" rel="stylesheet">`,
          { headers: { "content-type": "text/html" } },
        );
      if (url.pathname === "/entry.js")
        return new Response("console.log(1)", {
          headers: { "content-type": "application/javascript" },
        });
      if (url.pathname.startsWith("/app/"))
        return new Response('<div id="root"></div>', {
          headers: { "content-type": "text/html" },
        });
      if (url.pathname === "/style.css")
        return new Response(
          failure === "css" ? "" : "a { color: red; }".repeat(20),
          {
            status: failure === "redirect" ? 302 : 200,
            headers: { "content-type": "text/css" },
          },
        );
      return new Response(
        failure === "robots" ? "login" : "User-agent: *\nDisallow: /\n",
        { headers: { "content-type": "text/plain" } },
      );
    };
    if (failure)
      await assert.rejects(
        smoke("https://pool.example", { request, attempts: 1 }),
      );
    else {
      await smoke("https://pool.example", { request, attempts: 1 });
      assert.deepEqual(seen, [
        "/api/health",
        "/",
        "/entry.js",
        "/app/rides/00000000-0000-4000-8000-000000000001",
        "/style.css",
        "/robots.txt",
      ]);
    }
  }
});
