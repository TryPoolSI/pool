import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { writeFile, mkdir } from "node:fs/promises";
const baseline = process.argv[2] ?? "http://localhost:3002",
  current = process.argv[3] ?? "http://localhost:3003";
const browser = await chromium.launch();
const measurements = [];
try {
  for (const [implementation, origin] of [
    ["Next.js baseline", baseline],
    ["Expo", current],
  ])
    for (const [width, height] of [
      [1440, 1000],
      [390, 844],
    ])
      for (const path of ["/", "/sign-up"])
        for (let sample = 0; sample < 3; sample++) {
          const context = await browser.newContext({
              viewport: { width, height },
            }),
            page = await context.newPage();
          const errors = [];
          page.on("pageerror", (error) => errors.push(error.message));
          const started = performance.now();
          await page.goto(origin + path);
          await page.waitForFunction(
            (signup) =>
              Boolean(
                document.querySelector('h1,[role=heading][aria-level="1"]'),
              ) &&
              (!signup ||
                Boolean(
                  document.querySelector(
                    'input[aria-label="Email address"],input[type=email]',
                  ),
                )),
            path === "/sign-up",
            { polling: "raf" },
          );
          const readyMs = performance.now() - started;
          await page.evaluate(() => document.fonts.ready);
          await page.evaluate(
            () =>
              new Promise((resolve) =>
                requestAnimationFrame(() => requestAnimationFrame(resolve)),
              ),
          );
          const metrics = await page.evaluate(() => ({
            fcpMs: performance.getEntriesByName("first-contentful-paint")[0]
              ?.startTime,
            transferBytes: performance
              .getEntriesByType("resource")
              .reduce((sum, item) => sum + item.transferSize, 0),
            scriptBytes: performance
              .getEntriesByType("resource")
              .filter((item) => item.initiatorType === "script")
              .reduce((sum, item) => sum + item.encodedBodySize, 0),
          }));
          let signInTransitionMs = null;
          if (path === "/sign-up") {
            const interactionStarted = performance.now();
            await page
              .getByRole("link", {
                name: "Already have an account? Sign in",
                exact: true,
              })
              .click();
            await page.waitForFunction(
              () =>
                Array.from(
                  document.querySelectorAll(
                    'h1,[role=heading][aria-level="1"]',
                  ),
                ).some((node) => node.textContent === "Sign in to Pool"),
              undefined,
              { polling: "raf" },
            );
            signInTransitionMs = Math.round(
              performance.now() - interactionStarted,
            );
          }
          measurements.push({
            implementation,
            path,
            width,
            height,
            sample,
            readyMs: Math.round(readyMs),
            ...metrics,
            signInTransitionMs,
            errors,
          });
          await context.close();
        }
  await mkdir("docs/expo-migration", { recursive: true });
  await writeFile(
    "docs/expo-migration/performance.json",
    JSON.stringify(
      {
        expoRevision: execFileSync("git", ["rev-parse", "HEAD"], {
          encoding: "utf8",
        }).trim(),
        baselineRevision: "85ed3c5f484a600d1d1eaebf67861ef85adc4469",
        conditions:
          "Three fresh Chromium contexts per route/viewport, loopback HTTP, production builds, no artificial throttling. Ready means visible H1 and signup input when applicable. Sign-in transition measures Playwright clicking the signup Sign in link until the destination H1 renders, including browser actionability overhead.",
        measurements,
      },
      null,
      2,
    ) + "\n",
  );
  console.log("Captured matching production web measurements.");
} finally {
  await browser.close();
}
