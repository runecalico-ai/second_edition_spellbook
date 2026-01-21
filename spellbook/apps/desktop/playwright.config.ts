import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 120000,
  workers: 1,
  retries: 0,
  // reporter: [["list"], ["html"]],
  reporter: [["list"]],
  use: {
    trace: "on-first-retry",
  },
});
