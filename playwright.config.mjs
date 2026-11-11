import { defineConfig } from "@playwright/test";

if (
  process.env.AUTH_TEST_DISPOSABLE !== "1" ||
  process.env.EXPO_PUBLIC_SUPABASE_URL !== "http://localhost:55321"
) {
  throw new Error(
    "Run npm run test:auth to create the disposable local backend; hosted Auth testing is forbidden.",
  );
}

export default defineConfig({
  testDir: "./tests/auth",
  // Overlap the real JWT expiry wait with other journeys. Screenshot captures
  // share filenames and still run in order.
  workers: process.env.POOL_SCREENSHOTS_DIR ? 1 : 2,
  timeout: 180_000,
  expect: { timeout: 10_000 },
  retries: 0,
  reporter: "list",
  outputDir: process.env.AUTH_TEST_OUTPUT_DIR,
  use: {
    baseURL: "http://localhost:3100",
    browserName: "chromium",
    actionTimeout: 15_000,
    navigationTimeout: 15_000,
    trace: "off",
    screenshot: "off",
    video: "off",
  },
});
