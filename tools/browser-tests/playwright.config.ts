import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.FFD_BROWSER_TEST_BASE_URL ?? "http://localhost:3001";

export default defineConfig({
  testDir: "./test/integration",
  globalSetup: "./test/support/preflight.ts",
  outputDir: "./test-results",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  reporter: [["line"]],
  use: {
    baseURL,
    headless: true,
    screenshot: "off",
    trace: "off",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
