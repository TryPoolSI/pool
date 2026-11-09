import { AxeBuilder } from "@axe-core/playwright";
import { expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

// Called only by real, authenticated journeys against the disposable backend.
// No application fixtures, alternate rendering path, or production screenshot data.
export async function captureState(page, name, heading) {
  await page.getByRole("heading", { level: 1 }).waitFor();
  const directory = process.env.POOL_SCREENSHOTS_DIR
    ? resolve(process.env.POOL_SCREENSHOTS_DIR)
    : null;
  if (directory) await mkdir(directory, { recursive: true });
  const original = page.viewportSize();
  for (const [device, width, height] of [
    ["desktop", 1440, 1000],
    ["phone", 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => document.fonts.ready);
    if (heading)
      await page
        .getByRole("heading", { name: heading, exact: true })
        .evaluate((node) => node.scrollIntoView({ block: "start" }));
    else await page.evaluate(() => window.scrollTo(0, 0));
    if (process.env.POOL_BASELINE !== "1") {
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        )
        .toBe(true);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(
        results.violations.map(({ id, nodes }) => ({
          id,
          targets: nodes.map((n) => n.target),
        })),
      ).toEqual([]);
      const targets = await page
        .locator(
          "button:visible,.button:visible,label.checkbox-label:visible,summary:visible",
        )
        .evaluateAll((nodes) =>
          nodes.map((node) => ({
            text: node.textContent,
            height: node.getBoundingClientRect().height,
          })),
        );
      expect(targets.filter((target) => target.height < 44)).toEqual([]);
    }
    if (directory)
      await page.screenshot({
        path: resolve(directory, `${name}-${device}.png`),
        animations: "disabled",
      });
  }
  if (process.env.POOL_BASELINE !== "1") {
    await page.setViewportSize({ width: 320, height: 800 });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
  }
  if (original) await page.setViewportSize(original);
}
