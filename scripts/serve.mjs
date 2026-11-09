import { gzipSync } from "node:zlib";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { pathToFileURL } from "node:url";
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".ttf": "font/ttf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};
export function appServer({ directory = "dist" } = {}) {
  const root = resolve(directory);
  return createServer(async (request, response) => {
    response.setHeader("Referrer-Policy", "strict-origin");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader(
      "Cache-Control",
      "private, no-cache, no-store, must-revalidate, max-age=0",
    );
    if (!["GET", "HEAD"].includes(request.method)) {
      response.writeHead(405, { Allow: "GET, HEAD" });
      response.end();
      return;
    }
    let pathname;
    try {
      pathname = decodeURIComponent(
        new URL(request.url, "http://pool.invalid").pathname,
      );
    } catch {
      response.writeHead(400);
      response.end();
      return;
    }
    if (pathname === "/api/health") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        request.method === "HEAD"
          ? undefined
          : JSON.stringify({ status: "ok" }),
      );
      return;
    }
    if (pathname.includes("\0") || pathname.includes("\\")) {
      response.writeHead(400);
      response.end();
      return;
    }
    let file = resolve(root, `.${pathname}`);
    if (file !== root && !file.startsWith(root + sep)) {
      response.writeHead(404);
      response.end();
      return;
    }
    try {
      const info = await stat(file);
      if (info.isDirectory()) file = resolve(file, "index.html");
      await stat(file);
    } catch {
      const route =
        pathname === "/" ||
        /^\/(?:app(?:\/|$)|sign-in$|sign-up$|forgot-password$|reset-password$|auth\/(?:confirm|callback|error)$)/.test(
          pathname,
        );
      if (!route || extname(pathname)) {
        response.writeHead(404);
        response.end();
        return;
      }
      file = resolve(root, "index.html");
    }
    try {
      const body = await readFile(file),
        extension = extname(file);
      response.setHeader(
        "Content-Type",
        types[extension] || "application/octet-stream",
      );
      if (pathname.startsWith("/_expo/") || pathname.startsWith("/assets/"))
        response.setHeader(
          "Cache-Control",
          "public, max-age=31536000, immutable",
        );
      response.setHeader("Vary", "Accept-Encoding");
      const compress =
        body.length > 1024 &&
        /\bgzip\b/.test(request.headers["accept-encoding"] ?? "");
      if (compress) response.setHeader("Content-Encoding", "gzip");
      response.writeHead(200);
      response.end(
        request.method === "HEAD"
          ? undefined
          : compress
            ? gzipSync(body)
            : body,
      );
    } catch {
      response.writeHead(404);
      response.end();
    }
  });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const server = appServer();
  server.listen(
    Number(process.env.PORT || 3000),
    process.env.HOSTNAME || "127.0.0.1",
    () => console.log("Pool web ready"),
  );
}
