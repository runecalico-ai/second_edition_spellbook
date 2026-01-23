import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  // Maximum time one test can run for.
  timeout: 120000,
  // Maximum time expect() should wait for a condition to be met.
  expect: {
    timeout: 5000,
  },
  workers: 1, // Do not run tests in parallel
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  // Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions.
  use: {
    // Base URL to use in actions like `await page.goto('/')`.
    // Windows 11 has problems using localhost due to ipv6 resolution delays
    // baseURL: 'http://127.0.0.1:3000',

    // Collect trace when retrying the failed test.
    // See https://playwright.dev/docs/trace-viewer
    trace: "on-first-retry",
  },
  /* Folder for test artifacts such as screenshots, videos, traces, etc. */
  outputDir: "test-results/",
});
